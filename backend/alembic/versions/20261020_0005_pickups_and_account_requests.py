"""pick-up appointments and alumni / former student account requests

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-20 09:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
import app.db.base


revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'pickup_appointments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('time', sa.String(length=5), nullable=False),
        sa.Column('seat', sa.Integer(), nullable=False),
        sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['request_id'], ['requests.id'], name=op.f('fk_pickup_appointments_request_id_requests'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_pickup_appointments')),
        sa.UniqueConstraint('request_id', name=op.f('uq_pickup_appointments_request_id')),
        sa.UniqueConstraint('date', 'time', 'seat', name='uq_pickup_appointments_date_time_seat'),
    )
    op.create_index(op.f('ix_pickup_appointments_date'), 'pickup_appointments', ['date'], unique=False)

    op.create_table(
        'account_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('student_no', sa.String(length=20), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=False),
        sa.Column('middle_name', sa.String(length=100), nullable=True),
        sa.Column('last_name', sa.String(length=100), nullable=False),
        sa.Column('birthdate', sa.Date(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('contact_no', sa.String(length=20), nullable=True),
        sa.Column('program', sa.String(length=200), nullable=False),
        sa.Column('last_year_attended', sa.Integer(), nullable=False),
        sa.Column('standing', sa.Enum('enrolled', 'graduated', 'inactive', name='standing', native_enum=False, length=32), nullable=False),
        sa.Column('id_filename', sa.String(length=255), nullable=False),
        sa.Column('id_storage_key', sa.String(length=255), nullable=False),
        sa.Column('id_mime_type', sa.String(length=100), nullable=False),
        sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='accountrequeststatus', native_enum=False, length=32), nullable=False),
        sa.Column('remarks', sa.String(length=1000), nullable=True),
        sa.Column('reviewed_by_id', sa.Integer(), nullable=True),
        sa.Column('reviewed_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', app.db.base.UTCDateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', app.db.base.UTCDateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['reviewed_by_id'], ['users.id'], name=op.f('fk_account_requests_reviewed_by_id_users')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_account_requests_user_id_users')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_account_requests')),
    )
    op.create_index(op.f('ix_account_requests_status'), 'account_requests', ['status'], unique=False)
    op.create_index(op.f('ix_account_requests_student_no'), 'account_requests', ['student_no'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_account_requests_student_no'), table_name='account_requests')
    op.drop_index(op.f('ix_account_requests_status'), table_name='account_requests')
    op.drop_table('account_requests')
    op.drop_index(op.f('ix_pickup_appointments_date'), table_name='pickup_appointments')
    op.drop_table('pickup_appointments')
