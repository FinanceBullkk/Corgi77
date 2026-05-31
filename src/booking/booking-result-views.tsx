import type { ReactNode } from 'react';
import type { InitResult } from '../lib/types';
import type { Selection, Step1Data } from './booking-utils';
import { SuccessScreen } from './success-screen';
import { BookingDisplay } from './booking-display';

export function BookingSuccessView({
  data,
  emailQueued,
  step1,
  selection,
  topbar,
  onViewDetail,
}: {
  data: InitResult;
  emailQueued: boolean;
  step1: Step1Data;
  selection: Selection;
  topbar: ReactNode;
  onViewDetail: () => void;
}) {
  return (
    <div className="app">
      {topbar}
      <main className="container">
        <SuccessScreen
          email={data.email}
          emailSent={emailQueued}
          step1={step1}
          slots={data.slots}
          selection={selection}
          maxChanges={data.maxChanges}
          changeCount={data.myBooking?.changeCount ?? 0}
          assessmentName={data.assessmentName}
          onViewDetail={onViewDetail}
        />
      </main>
    </div>
  );
}

export function CurrentBookingView({
  data,
  topbar,
  onEdit,
  onCancelled,
  onError,
}: {
  data: InitResult;
  topbar: ReactNode;
  onEdit: () => void;
  onCancelled: (newState: InitResult) => void;
  onError: (msg: string) => void;
}) {
  if (!data.myBooking) return null;
  return (
    <div className="app">
      {topbar}
      <main className="container">
        <BookingDisplay
          email={data.email}
          booking={data.myBooking}
          slots={data.slots}
          deadlinePassed={data.deadlinePassed}
          allowEnrollment={data.allowEnrollment}
          maxChanges={data.maxChanges}
          assessmentName={data.assessmentName}
          onEdit={onEdit}
          onCancelled={onCancelled}
          onError={onError}
        />
      </main>
    </div>
  );
}
