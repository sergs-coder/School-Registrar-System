"""pick-up daily limit: a numbered seat per day for each appointment

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-25 09:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0006'
down_revision: str | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('pickup_appointments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('day_seat', sa.Integer(), nullable=True))

    # Number existing bookings 1, 2, 3 ... within each day, earliest booking first.
    conn = op.get_bind()
    rows = conn.execute(sa.text('SELECT id, date FROM pickup_appointments ORDER BY date, created_at, id')).all()
    counts: dict = {}
    for row_id, day in rows:
        counts[day] = counts.get(day, 0) + 1
        conn.execute(sa.text('UPDATE pickup_appointments SET day_seat = :n WHERE id = :id'),
                     {'n': counts[day], 'id': row_id})

    with op.batch_alter_table('pickup_appointments', schema=None) as batch_op:
        batch_op.alter_column('day_seat', existing_type=sa.Integer(), nullable=False)
        batch_op.create_unique_constraint('uq_pickup_appointments_date_day_seat', ['date', 'day_seat'])


def downgrade() -> None:
    with op.batch_alter_table('pickup_appointments', schema=None) as batch_op:
        batch_op.drop_constraint('uq_pickup_appointments_date_day_seat', type_='unique')
        batch_op.drop_column('day_seat')
