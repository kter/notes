# The GitHub OIDC provider already exists in each account and is NOT managed
# here: creating or deleting it from this root could break other repositories
# that federate through it. If this lookup fails, the provider is missing; see
# docs/agents/deploy.md before creating one.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_host = "token.actions.githubusercontent.com"

  ecr_repository_arn = "arn:aws:ecr:${var.aws_region}:${local.account_id}:repository/${local.ecr_repository_name}"

  app_role_arn_pattern   = "arn:aws:iam::${local.account_id}:role/notes-app-*"
  app_policy_arn_pattern = "arn:aws:iam::${local.account_id}:policy/notes-app-*"
  ci_role_arn_pattern    = "arn:aws:iam::${local.account_id}:role/notes-gha-*"
}

# -----------------------------------------------------------------------------
# Trust policies: one GitHub environment per role. The environment, not the
# branch, is in `sub`; GitHub enforces "main only" through the environment's
# deployment branch policy.
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "plan_trust" {
  statement {
    sid     = "GitHubActionsPlanEnvironment"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = ["repo:${var.github_repository}:environment:${local.plan_github_environment}"]
    }
  }
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    sid     = "GitHubActionsDeployEnvironment"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = ["repo:${var.github_repository}:environment:${local.deploy_github_environment}"]
    }
  }
}

# -----------------------------------------------------------------------------
# notes-gha-plan-<env>: runs BEFORE approval. It only builds and pushes the
# candidate image (tag git-<sha>). It never runs Terraform, so it needs no
# state, SSM or read-only access: nothing secret is reachable pre-approval.
# -----------------------------------------------------------------------------

resource "aws_iam_role" "plan" {
  name                 = "notes-gha-plan-${var.environment}"
  description          = "GitHub Actions ${local.plan_github_environment}: push candidate backend images to ECR (no Terraform, no secrets)"
  assume_role_policy   = data.aws_iam_policy_document.plan_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "plan_ecr_push" {
  statement {
    sid       = "EcrLogin"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPushToAppRepository"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [local.ecr_repository_arn]
  }
}

resource "aws_iam_role_policy" "plan_ecr_push" {
  name   = "ecr-push"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan_ecr_push.json
}

# -----------------------------------------------------------------------------
# notes-gha-deploy-<env>: runs only AFTER a required reviewer approves the
# deploy-<env> environment. Terraform plan/apply of the app root plus the
# frontend upload.
#   - PowerUserAccess (everything except IAM / Organizations / Account)
#   - IAM limited to notes-app-* roles and policies (incl. PassRole)
#   - explicit Deny on the CI roles, the OIDC provider, role chaining, and the
#     ci-bootstrap state, so the deploy role cannot widen its own access.
# -----------------------------------------------------------------------------

resource "aws_iam_role" "deploy" {
  name                 = "notes-gha-deploy-${var.environment}"
  description          = "GitHub Actions ${local.deploy_github_environment}: terraform apply of the app root and frontend deploy (approval-gated)"
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust.json
  max_session_duration = 7200
}

resource "aws_iam_role_policy_attachment" "deploy_power_user" {
  role       = aws_iam_role.deploy.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

data "aws_iam_policy_document" "deploy_app_iam" {
  # Terraform refresh reads roles, policies and attachments, including
  # AWS-managed ones (AWSLambdaBasicExecutionRole, AWSBackupServiceRolePolicy*).
  # IAM metadata is not secret.
  statement {
    sid    = "IamRead"
    effect = "Allow"
    actions = [
      "iam:Get*",
      "iam:List*",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ManageAppRoles"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PassRole",
      "iam:PutRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
    ]
    resources = [local.app_role_arn_pattern]
  }

  # Attach only AWS service-role managed policies (what backup.tf and iam.tf
  # use today) or the app's own customer-managed policies. This blocks the
  # obvious escalation of attaching AdministratorAccess to a notes-app-* role.
  statement {
    sid       = "AttachLimitedManagedPolicies"
    effect    = "Allow"
    actions   = ["iam:AttachRolePolicy"]
    resources = [local.app_role_arn_pattern]

    condition {
      test     = "ArnLike"
      variable = "iam:PolicyARN"
      values = [
        "arn:aws:iam::aws:policy/service-role/*",
        local.app_policy_arn_pattern,
      ]
    }
  }

  statement {
    sid    = "ManageAppPolicies"
    effect = "Allow"
    actions = [
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
      "iam:TagPolicy",
      "iam:UntagPolicy",
    ]
    resources = [local.app_policy_arn_pattern]
  }
}

resource "aws_iam_role_policy" "deploy_app_iam" {
  name   = "notes-app-iam"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_app_iam.json
}

data "aws_iam_policy_document" "deploy_guardrails" {
  statement {
    sid       = "DenyChangingCiRoles"
    effect    = "Deny"
    actions   = ["iam:*"]
    resources = [local.ci_role_arn_pattern]
  }

  statement {
    sid    = "DenyChangingOidcProviders"
    effect = "Deny"
    actions = [
      "iam:AddClientIDToOpenIDConnectProvider",
      "iam:CreateOpenIDConnectProvider",
      "iam:DeleteOpenIDConnectProvider",
      "iam:RemoveClientIDFromOpenIDConnectProvider",
      "iam:TagOpenIDConnectProvider",
      "iam:UntagOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
    ]
    resources = ["*"]
  }

  # PowerUserAccess allows sts:AssumeRole on "*". Any role in the account that
  # trusts the account root (for example CDK bootstrap roles, whose
  # CloudFormation execution role is often AdministratorAccess) would then be
  # a way around everything above. Terraform here never chains roles.
  statement {
    sid       = "DenyRoleChaining"
    effect    = "Deny"
    actions   = ["sts:AssumeRole"]
    resources = ["*"]
  }

  # The deploy role needs the app state (PowerUserAccess covers S3/DynamoDB),
  # but must not rewrite the state of this root or loosen the state bucket.
  statement {
    sid    = "DenyWritingCiBootstrapState"
    effect = "Deny"
    actions = [
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:PutObject",
    ]
    resources = ["arn:aws:s3:::${local.state_bucket}/notes-app/ci-bootstrap.tfstate*"]
  }

  statement {
    sid    = "DenyLooseningStateBucket"
    effect = "Deny"
    actions = [
      "s3:DeleteBucket",
      "s3:DeleteBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketVersioning",
      "s3:PutLifecycleConfiguration",
    ]
    resources = ["arn:aws:s3:::${local.state_bucket}"]
  }

  statement {
    sid    = "DenyDeletingLockTable"
    effect = "Deny"
    actions = [
      "dynamodb:DeleteTable",
      "dynamodb:UpdateTable",
    ]
    resources = ["arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/${local.lock_table}"]
  }
}

resource "aws_iam_role_policy" "deploy_guardrails" {
  name   = "guardrails"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_guardrails.json
}
