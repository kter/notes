from uuid import UUID

from sqlmodel import Session

from app.features.assistant.use_cases.common import (
    ensure_token_limit,
    require_non_empty,
)
from app.features.workspace.use_cases.queries import WorkspaceQueryUseCases
from app.models import AIEditJob, AIEditJobCreate
from app.shared import NotFound


class EditJobUseCases:
    """Application use cases for creating and fetching AI edit jobs."""

    def __init__(
        self,
        session: Session,
        user_id: str,
        workspace_queries: WorkspaceQueryUseCases,
    ):
        self.session = session
        self.user_id = user_id
        self.workspace_queries = workspace_queries

    def create_job(self, job_in: AIEditJobCreate) -> AIEditJob:
        require_non_empty(job_in.content, "Content is empty")
        require_non_empty(job_in.instruction, "Instruction is empty")
        if job_in.note_id is not None:
            self.workspace_queries.get_owned_note(job_in.note_id)

        ensure_token_limit(self.session, self.user_id)

        job = AIEditJob(
            user_id=self.user_id,
            note_id=job_in.note_id,
            content=job_in.content,
            instruction=job_in.instruction,
            status="pending",
        )
        self.session.add(job)
        self.session.commit()
        self.session.refresh(job)
        return job

    def get_job(self, job_id: UUID) -> AIEditJob:
        job = self.session.get(AIEditJob, job_id)
        if job is None or job.user_id != self.user_id:
            raise NotFound("Edit job not found")
        return job
