import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { formatDateVi, minToHHmm, type InitResult } from '../lib/types';
import type { Selection, Step1Data } from './booking-utils';
import { CalendarStep } from './calendar-step';
import { ConfirmModal } from './confirm-modal';

export function BookingStep2View({
  data,
  step1,
  selection,
  setSelection,
  curSpId,
  curSkId,
  isConfirm,
  isEditing,
  onBack,
  onConfirmOpen,
  onConfirmCancel,
  onConfirmSubmit,
  topbar,
}: {
  data: InitResult;
  step1: Step1Data;
  selection: Selection;
  setSelection: Dispatch<SetStateAction<Selection>>;
  curSpId: string | null;
  curSkId: string | null;
  isConfirm: boolean;
  isEditing: boolean;
  onBack: () => void;
  onConfirmOpen: () => void;
  onConfirmCancel: () => void;
  onConfirmSubmit: () => Promise<void>;
  topbar: ReactNode;
}) {
  const spSel = data.slots.find((s) => s.slotId === selection.speakingId) ?? null;
  const skSel = data.slots.find((s) => s.slotId === selection.skillsId) ?? null;
  const canSubmit = !!(selection.speakingId && selection.skillsId);

  return (
    <div className="app">
      {topbar}
      <main className="container wide" style={{ paddingBottom: 24 }}>
        <CalendarStep
          step1={step1}
          slots={data.slots}
          selection={selection}
          setSelection={setSelection}
          curSpId={curSpId}
          curSkId={curSkId}
          deadlinePassed={data.deadlinePassed}
          onBack={onBack}
        />
      </main>

      {isConfirm && (
        <ConfirmModal
          step1={step1}
          slots={data.slots}
          selection={selection}
          isEditing={isEditing}
          maxChanges={data.maxChanges}
          changeCount={data.myBooking?.changeCount ?? 0}
          onCancel={onConfirmCancel}
          onConfirm={onConfirmSubmit}
        />
      )}

      <div className="sticky-summary">
        <div className="sticky-summary-inner">
          <div className="summary-items">
            <div className={`summary-item ${spSel ? 'filled' : ''}`}>
              <div className="badge">①</div>
              <div>
                <div className="lbl">Speaking</div>
                <div className={`val ${spSel ? '' : 'empty'}`}>
                  {spSel
                    ? `${formatDateVi(spSel.date)} · ${minToHHmm(spSel.startMin)}–${minToHHmm(spSel.endMin)}`
                    : 'Chưa chọn ca'}
                </div>
              </div>
            </div>
            <div className={`summary-item ${skSel ? 'filled' : ''}`}>
              <div className="badge">②</div>
              <div>
                <div className="lbl">3 Skills</div>
                <div className={`val ${skSel ? '' : 'empty'}`}>
                  {skSel
                    ? `${formatDateVi(skSel.date)} · ${minToHHmm(skSel.startMin)}–${minToHHmm(skSel.endMin)}`
                    : 'Chưa chọn ca'}
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn ghost" onClick={onBack}>← Quay lại</button>
            <button
              className={`btn ${canSubmit ? '' : 'disabled'}`}
              disabled={!canSubmit}
              onClick={onConfirmOpen}
            >
              Tiếp tục →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
