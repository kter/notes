import type { Page, Request, Response } from '@playwright/test';

type WorkspaceEntityType = 'folder' | 'note';
type WorkspaceOperationType = 'create' | 'update' | 'delete';

interface WorkspaceChangeRequest {
  entity?: WorkspaceEntityType;
  operation?: WorkspaceOperationType;
}

interface WorkspaceChangesRequestBody {
  changes?: WorkspaceChangeRequest[];
}

interface WorkspaceAppliedChange {
  entity: WorkspaceEntityType;
  operation: WorkspaceOperationType;
  entity_id: string;
}

interface WorkspaceChangesResponseBody {
  applied?: WorkspaceAppliedChange[];
}

function getWorkspaceChangesBody(request: Request): WorkspaceChangesRequestBody | null {
  if (!request.url().includes('/api/workspace/changes') || request.method() !== 'POST') {
    return null;
  }

  try {
    return request.postDataJSON() as WorkspaceChangesRequestBody;
  } catch {
    return null;
  }
}

export function isWorkspaceChangeRequest(
  request: Request,
  entity: WorkspaceEntityType,
  operation: WorkspaceOperationType
): boolean {
  const body = getWorkspaceChangesBody(request);
  return Boolean(body?.changes?.some(change => change.entity === entity && change.operation === operation));
}

export function isWorkspaceChangeResponse(
  response: Response,
  entity: WorkspaceEntityType,
  operation: WorkspaceOperationType
): boolean {
  return response.status() < 400 && isWorkspaceChangeRequest(response.request(), entity, operation);
}

export async function waitForWorkspaceChange(
  page: Page,
  entity: WorkspaceEntityType,
  operation: WorkspaceOperationType,
  timeout = 30000
): Promise<Response> {
  return page.waitForResponse(
    response => isWorkspaceChangeResponse(response, entity, operation),
    { timeout }
  );
}

export async function getAppliedEntityId(
  response: Response,
  entity: WorkspaceEntityType,
  operation: WorkspaceOperationType
): Promise<string> {
  const body = await response.json() as WorkspaceChangesResponseBody;
  const applied = body.applied?.find(change => change.entity === entity && change.operation === operation);
  if (!applied) {
    throw new Error(`Workspace change response missing applied ${entity}:${operation}`);
  }
  return applied.entity_id;
}
