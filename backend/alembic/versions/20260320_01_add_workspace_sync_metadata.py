"""add workspace sync metadata"""

import sqlalchemy as sa

from alembic import op

revision = "20260320_01"
down_revision = "797061e639d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "folders",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "folders",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "notes",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "notes",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("notes", "deleted_at")
    op.drop_column("notes", "version")
    op.drop_column("folders", "deleted_at")
    op.drop_column("folders", "version")
