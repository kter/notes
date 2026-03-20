"""add applied mutations"""

import sqlalchemy as sa

from alembic import op

revision = "20260320_02"
down_revision = "20260320_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "applied_mutations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("client_mutation_id", sa.String(length=255), nullable=False),
        sa.Column("entity", sa.String(length=32), nullable=False),
        sa.Column("operation", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("response_payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "client_mutation_id",
            name="uq_applied_mutations_user_client_mutation",
        ),
    )


def downgrade() -> None:
    op.drop_table("applied_mutations")
