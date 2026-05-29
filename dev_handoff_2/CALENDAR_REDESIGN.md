# Step 2 — Calendar Redesign (Google/Outlook week view)

> Bản vá UI cho màn **Chọn ca thi** (Step 2). Lịch cũ bị "cái to cái nhỏ, cái dài cái ngắn" → dựng lại theo mô hình **cột định vị tuyệt đối** chuẩn calendar.
> Files đụng tới: `step2-calendar.jsx` (phần render lịch) + `calendar.css` (toàn bộ grid & block). Logic chọn ca / conflict / auto-switch tab **không đổi**.

---

## 1. Vì sao đổi

| Vấn đề bản cũ | Cách xử lý |
|---|---|
| Block render trong từng ô giờ (`.cal-cell`) bằng `display:contents` → khó căn, kẻ giờ mờ nhạt | Mỗi ngày là **1 cột full-height duy nhất**, block `position:absolute` theo phút → khớp lưới pixel-perfect |
| Ghost "đã chọn ở tab kia" là hộp viền đứt **to đùng** lấn cả cột | Ghost giờ là block mềm, viền đứt nhạt, **đúng kích thước thật**, nền theo tone nhạt |
| Nội dung trong block mỗi cái một kiểu | Anatomy thống nhất: **thanh màu trái + giờ in đậm + phòng + số chỗ** ở mọi kích thước |
| Không có vạch nửa giờ, nhịp rối | Lưới **giờ (đậm) + nửa giờ (nhạt)** vẽ bằng CSS gradient |

---

## 2. Mô hình DOM mới

```
.cal
├── .cal-header            (grid: [gutter] + 5 cột ngày, sticky top)
│   ├── .cal-corner
│   └── .cal-dayhead × 5   → .dh-day (T2…) / .dh-date (22/06)
└── .cal-body              (grid: [gutter] + 5 cột, height = HOURS.length × ROW_H)
    ├── .cal-gutter        (relative) → .cal-hourlabel × N, top = i × ROW_H
    └── .cal-col × 5       (relative, vẽ lưới giờ bằng background-image)
        ├── .ev.ghost      (tùy chọn — ca đã chọn ở tab kia)
        └── .ev × n        (các ca trong ngày)
```

Header và body **dùng chung** `grid-template-columns: var(--gutter) repeat(5, 1fr)` để 2 phần thẳng cột.

---

## 3. Hằng số & công thức định vị

```js
const ROW_H = 64;       // px / 1 giờ — PHẢI khớp với CSS --row-h trong .cal
const FIRST_HOUR = 9;   // lịch bắt đầu 09:00

// slot.start / slot.end tính bằng PHÚT từ 00:00 (vd 09:00 = 540)
const topPx    = ((slot.start - FIRST_HOUR * 60) / 60) * ROW_H + 2;  // +2 = gap trên
const heightPx = ((slot.end   - slot.start)      / 60) * ROW_H - 4;  // -4 = gap trên+dưới

// nhãn giờ trong gutter
hourLabelTop = i * ROW_H;   // i = index trong mảng HOURS
```

> ⚠️ Đổi `ROW_H` thì **phải đổi luôn** `--row-h` trong `.cal` (CSS). Hai giá trị này là một.

---

## 4. CSS cốt lõi

### Lưới giờ — vẽ bằng gradient trên `.cal-col`
```css
.cal-col {
  position: relative;
  border-left: 1px solid var(--ink-150);
  background-image:
    /* vạch GIỜ — đậm */
    repeating-linear-gradient(to bottom,
      transparent 0, transparent calc(var(--row-h) - 1px),
      var(--ink-150) calc(var(--row-h) - 1px), var(--ink-150) var(--row-h)),
    /* vạch NỬA GIỜ — nhạt */
    repeating-linear-gradient(to bottom,
      transparent 0, transparent calc(var(--row-h) / 2 - 1px),
      var(--ink-100) calc(var(--row-h) / 2 - 1px), var(--ink-100) calc(var(--row-h) / 2));
}
```
Production có thể thay 2 gradient này bằng border-top trên các div `.hour-row` nếu muốn DOM rõ nghĩa hơn — kết quả thị giác như nhau.

### Block (`.ev`) — anatomy thống nhất
- `position:absolute; left/right:5px` → full chiều rộng cột trừ gutter nhỏ.
- `border-left: 3px solid <tone>` = **thanh màu nhận diện loại ca** (xanh = Speaking, cam = 3 Skills).
- Nội dung: `.ev-time` (giờ, đậm, `tabular-nums`) + `.ev-meta` (`.ev-room` trái / `.ev-rem` phải).

### Bảng trạng thái → class

| Trạng thái | Class | Hình thức |
|---|---|---|
| Còn chỗ | `.ev.sp` / `.ev.sk` | nền tone-50, thanh trái tone-500 |
| Sắp hết (≤30%) | thêm `.warn` lên `.ev-rem` | số chỗ đổi màu `--warn-600` |
| Đang chọn | `.ev.sp.sel` / `.ev.sk.sel` | nền đặc tone-500, chữ trắng, chip ✓ góc phải |
| Hết chỗ | `.ev.full` | gạch chéo (hatch), giờ gạch ngang, "HẾT CHỖ" |
| Trùng giờ | `.ev.conflict` | xám mờ, `disabled`, "Trùng giờ" |
| Đã chọn ở tab kia (ghost) | `.ev.ghost.sp` / `.ev.ghost.sk` | viền đứt nhạt, nền tone-50, không click |

Màu lấy 100% từ `tokens.css` (`--brand-*` cho Speaking, `--accent-*` cho 3 Skills). **Không hard-code hex.**

---

## 5. Lưu ý khi port lên production

1. **Không chồng giờ cùng loại (RÀNG BUỘC NGHIỆP VỤ):** mỗi loại chỉ chạy **1 ca / khung giờ** → trong cùng 1 ngày các ca cùng loại **không bao giờ trùng giờ**. Vì vậy model render full chiều rộng cột là **đủ và đúng** — KHÔNG cần lane-packing / chia cột. Backend nên enforce ràng buộc này khi tạo slot.
2. **Min-height cho ca ngắn:** ca 30 phút sẽ chỉ cao `ROW_H/2 = 32px`, có thể chật. Mock chỉ có ca 60'/120'/150'. Nếu thêm ca ngắn → đặt `min-height` cho `.ev` và rút gọn `.ev-meta`.
3. **Giờ bắt đầu/kết thúc lịch:** `FIRST_HOUR` và mảng `HOURS` đang hard-code 09–17. Production nên lấy từ min/max của slot trả về từ `GET /api/slots`.
4. **Cột ngày:** đang fix 5 ngày (T2–T6). Nếu kỳ thi trải nhiều tuần → cần week navigation thật (nút ‹ › hiện đang `disabled`) + đổi `repeat(5, …)` thành số ngày động.
5. **Truncate phòng:** ở khung hẹp `.ev-room` ellipsis "Phòng…". Trên desktop rộng (>1200px) không xảy ra. Nếu cần chắc, ẩn `.ev-room` dưới breakpoint nhỏ thay vì cắt chữ.
6. **`tabular-nums`** đang dùng cho giờ & số chỗ — giữ lại để số không nhảy.

---

## 6. Checklist QA cho bản vá này

- [ ] Block căn đúng vạch giờ (09:00 nằm sát đỉnh, 13:30 nằm giữa ô 13–14).
- [ ] Ca 120' cao gấp đôi ca 60', không lệch ±1px.
- [ ] Chọn 1 ca Speaking → tab tự nhảy sang 3 Skills → ca Speaking hiện dạng **ghost** (viền đứt) ở tab 3 Skills, đúng vị trí/độ cao.
- [ ] Ca trùng giờ với ghost bị mờ + không click được.
- [ ] Ca hết chỗ gạch chéo, không click.
- [ ] Ca đang chọn nền đặc + có ✓.
- [ ] Responsive: thu nhỏ cửa sổ, lưới và block co giãn, không vỡ layout.

---

## 7. Files trong package này (đã đồng bộ bản mới)

- `prototype/01-hifi/calendar.css` — toàn bộ grid + block styles (bản mới).
- `prototype/01-hifi/step2-calendar.jsx` — render lịch (bản mới).
- `prototype/01-hifi/tokens.css`, `data.js` — không đổi, kèm để chạy được standalone.
