"""reminders: per-request reminder bookkeeping and a student opt-out for reminder emails

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-19 18:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
import app.db.base


revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('requests', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reminder_count', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('last_reminded_at', app.db.base.UTCDateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('delay_notified_at', app.db.base.UTCDateTime(timezone=True), nullable=True))
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reminder_emails', sa.Boolean(), server_default=sa.true(), nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.drop_column('reminder_emails')
    with op.batch_alter_table('requests', schema=None) as batch_op:
        batch_op.drop_column('delay_notified_at')
        batch_op.drop_column('last_reminded_at')
        batch_op.drop_column('reminder_count')
