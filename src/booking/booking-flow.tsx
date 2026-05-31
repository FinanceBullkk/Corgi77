import { useCallback, useEffect, useState } from 'react';
import type { InitResult } from '../lib/types';
import { bookDb } from '../lib/db';
import { useToast } from '../confirm-toast-provider';
import { computeDeadline, type FlowState, type Step1Data, type Selection } from './booking-utils';
import { Topbar } from './booking-chrome';
import { Step1Form } from './step1-form';
import { BookingStep2View } from './booking-step2-view';
import { DeadlinePassed, EnrollmentLocked } from './booking-gates';
import { BookingSuccessView, CurrentBookingView } from './booking-result-views';

export function BookingFlow({
  data,
  setData,
  canAdmin,
  skew,
  onOpenAdmin,
  onSignOut,
}: {
  data: InitResult;
  setData: (data: InitResult) => void;
  canAdmin: boolean;
  skew: number;
  onOpenAdmin: () => void;
  onSignOut: () => void;
}) {
  const [screen, setScreen] = useState<FlowState>(data.myBooking ? 'display' : 'step1');
  const [step1, setStep1] = useState<Step1Data>({
    empCode: data.myBooking?.empCode ?? '',
    fullName: data.myBooking?.fullName ?? '',
    bu: data.myBooking?.bu ?? '',
  });
  const [selection, setSelection] = useState<Selection>({
    speakingId: data.myBooking?.speakingSlotId ?? null,
    skillsId: data.myBooking?.skillsSlotId ?? null,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [emailQueued, setEmailQueued] = useState(false);
  const pushToast = useToast();

  useEffect(() => {
    setScreen(data.myBooking ? 'display' : 'step1');
    setStep1({
      empCode: data.myBooking?.empCode ?? '',
      fullName: data.myBooking?.fullName ?? '',
      bu: data.myBooking?.bu ?? '',
    });
    setSelection({
      speakingId: data.myBooking?.speakingSlotId ?? null,
      skillsId: data.myBooking?.skillsSlotId ?? null,
    });
    setIsEditing(false);
    setEmailQueued(false);
  }, [data.email]);

  const deadlineInfo = computeDeadline(data.deadline, data.clientNow, data.deadlinePassed, skew);
  const curSpId = isEditing ? (data.myBooking?.speakingSlotId ?? null) : null;
  const curSkId = isEditing ? (data.myBooking?.skillsSlotId ?? null) : null;

  const topbar = (
    <Topbar
      email={data.email}
      deadlineInfo={deadlineInfo}
      canAdmin={canAdmin}
      onOpenAdmin={onOpenAdmin}
      onSignOut={onSignOut}
    />
  );

  const handleConfirmSubmit = useCallback(async () => {
    if (!selection.speakingId || !selection.skillsId) return;
    if (
      isEditing &&
      step1.empCode === (data.myBooking?.empCode ?? '') &&
      selection.speakingId === curSpId &&
      selection.skillsId === curSkId
    ) {
      setIsEditing(false);
      setScreen('display');
      return;
    }
    try {
      const res = await bookDb(data.email, {
        empCode: step1.empCode,
        fullName: step1.fullName,
        bu: step1.bu,
        speakingSlotId: selection.speakingId,
        skillsSlotId: selection.skillsId,
      });
      if (!res.ok) {
        pushToast('error', res.error || 'Đăng ký thất bại.');
        if (res.state) setData(res.state);
        setScreen('step2');
      } else if (res.state) {
        setData(res.state);
        setIsEditing(false);
        setEmailQueued(!!res.emailSent);
        setScreen('success');
      } else {
        pushToast('error', 'Đăng ký thành công nhưng không nhận được state. Tải lại trang.');
        setScreen('step2');
      }
    } catch (e) {
      pushToast('error', (e as Error).message || 'Đăng ký thất bại.');
      setScreen('step2');
    }
  }, [curSkId, curSpId, data.email, data.myBooking, isEditing, pushToast, selection, setData, step1]);

  if (screen === 'step1') {
    if (!isEditing && !data.allowEnrollment) {
      return <EnrollmentLocked topbar={topbar} />;
    }
    if (!isEditing && data.deadlinePassed) {
      return <DeadlinePassed topbar={topbar} />;
    }
    return (
      <div className="app">
        {topbar}
        <main className="container">
          <Step1Form
            email={data.email}
            initial={step1}
            buList={data.buList}
            onContinue={(d) => { setStep1(d); setScreen('step2'); }}
            onCancel={isEditing ? () => { setIsEditing(false); setScreen('display'); } : undefined}
          />
        </main>
      </div>
    );
  }

  if (screen === 'step2' || screen === 'confirm') {
    return (
      <BookingStep2View
        data={data}
        step1={step1}
        selection={selection}
        setSelection={setSelection}
        curSpId={curSpId}
        curSkId={curSkId}
        isConfirm={screen === 'confirm'}
        isEditing={isEditing}
        onBack={() => setScreen('step1')}
        onConfirmOpen={() => setScreen('confirm')}
        onConfirmCancel={() => setScreen('step2')}
        onConfirmSubmit={handleConfirmSubmit}
        topbar={topbar}
      />
    );
  }

  if (screen === 'success') {
    return (
      <BookingSuccessView
        data={data}
        emailQueued={emailQueued}
        step1={step1}
        selection={selection}
        topbar={topbar}
        onViewDetail={() => {
          if (data.myBooking) setSelection({ speakingId: data.myBooking.speakingSlotId, skillsId: data.myBooking.skillsSlotId });
          setScreen('display');
        }}
      />
    );
  }

  if (screen === 'display' && data.myBooking) {
    return (
      <CurrentBookingView
        data={data}
        topbar={topbar}
        onEdit={() => {
          setIsEditing(true);
          setSelection({ speakingId: data.myBooking!.speakingSlotId, skillsId: data.myBooking!.skillsSlotId });
          setScreen('step2');
        }}
        onCancelled={(newState) => {
          pushToast('success', 'Đã hủy đăng ký.');
          setData(newState);
          setSelection({ speakingId: null, skillsId: null });
          setIsEditing(false);
          setScreen('step1');
        }}
        onError={(msg) => pushToast('error', msg)}
      />
    );
  }

  return null;
}
