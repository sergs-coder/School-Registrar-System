"""student personal email (verified) for request updates

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-19 15:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
import app.db.base


revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.add_column(sa.Column('personal_email', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('personal_email_verified_at', app.db.base.UTCDateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('personal_email_token_hash', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('personal_email_token_expires_at', app.db.base.UTCDateTime(timezone=True), nullable=True))
        batch_op.create_unique_constraint(batch_op.f('uq_students_personal_email_token_hash'), ['personal_email_token_hash'])


def downgrade() -> None:
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('uq_students_personal_email_token_hash'), type_='unique')
        batch_op.drop_column('personal_email_token_expires_at')
        batch_op.drop_column('personal_email_token_hash')
        batch_op.drop_column('personal_email_verified_at')
        batch_op.drop_column('personal_email')
