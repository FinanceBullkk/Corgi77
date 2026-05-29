// ─────────────────────────────────────────────────────────────────────────
// Main · composes wireframes into a DesignCanvas
// ─────────────────────────────────────────────────────────────────────────

const App = () => (
  <DesignCanvas>
    <DCSection id="flow" title="Linear Flow — Sign-in → Step 1 → Confirm → Success → Display" subtitle="Các màn hình tuyến tính. Step 2 ở section riêng phía dưới với 3 variation.">
      <DCArtboard id="signin" label="01 · Sign-In" width={560} height={520}>
        <SignInScreen />
      </DCArtboard>
      <DCArtboard id="step1" label="02 · Step 1 · Thông tin học viên" width={680} height={620}>
        <Step1UserInfo />
      </DCArtboard>
      <DCArtboard id="confirm" label="04 · Confirm Modal" width={620} height={620}>
        <ConfirmModal />
      </DCArtboard>
      <DCArtboard id="success" label="05 · Success Screen" width={680} height={780}>
        <SuccessScreen />
      </DCArtboard>
      <DCArtboard id="display" label="06 · Booking Display (Đã đăng ký)" width={680} height={780}>
        <BookingDisplay />
      </DCArtboard>
    </DCSection>

    <DCSection
      id="step2"
      title="Step 2 — Chọn ca thi · 3 VARIATIONS"
      subtitle="Phần critical nhất. Chọn 1 hướng để chuyển sang hi-fi. Annotation màu vàng giải thích rationale UX."
    >
      <DCArtboard id="step2a" label="A · Timeline 2-column" width={780} height={920}>
        <Step2VariationA />
      </DCArtboard>
      <DCArtboard id="step2b" label="B · Stacked by Date + Filters" width={780} height={920}>
        <Step2VariationB />
      </DCArtboard>
      <DCArtboard id="step2c" label="C · Calendar Week View" width={780} height={920}>
        <Step2VariationC />
      </DCArtboard>
    </DCSection>

    <DCSection id="patterns" title="Detail Patterns" subtitle="Slot card states + reusable building blocks">
      <DCArtboard id="states" label="Slot Card · 6 States" width={780} height={320}>
        <SlotCardStates />
      </DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
