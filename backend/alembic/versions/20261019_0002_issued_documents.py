"""issued documents (pick-up slips and e-documents with QR verification)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-19 09:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
import app.db.base


revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('issued_documents',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=16), nullable=False),
    sa.Column('request_id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.Enum('pickup_slip', 'e_document', name='issuedkind', native_enum=False, length=32), nullable=False),
    sa.Column('attachment_id', sa.Integer(), nullable=True),
    sa.Column('issued_by_id', sa.Integer(), nullable=True),
    sa.Column('issued_at', app.db.base.UTCDateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', app.db.base.UTCDateTime(timezone=True), nullable=True),
    sa.Column('revoke_reason', sa.String(length=300), nullable=True),
    sa.ForeignKeyConstraint(['attachment_id'], ['request_attachments.id'], name=op.f('fk_issued_documents_attachment_id_request_attachments')),
    sa.ForeignKeyConstraint(['issued_by_id'], ['users.id'], name=op.f('fk_issued_documents_issued_by_id_users')),
    sa.ForeignKeyConstraint(['request_id'], ['requests.id'], name=op.f('fk_issued_documents_request_id_requests'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_issued_documents'))
    )
    with op.batch_alter_table('issued_documents', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_issued_documents_code'), ['code'], unique=True)
        batch_op.create_index(batch_op.f('ix_issued_documents_request_id'), ['request_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('issued_documents', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_issued_documents_request_id'))
        batch_op.drop_index(batch_op.f('ix_issued_documents_code'))

    op.drop_table('issued_documents')
