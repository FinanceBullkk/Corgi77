---
name: audit
description: "Liệt kê và chạy các audit may-đo cho repo Corgi7. Kích hoạt khi user gõ /audit, 'liệt kê audit', 'menu audit', 'chạy audit #N', hoặc muốn rà soát 1 mảng (bảo mật, concurrency/giao dịch, nghiệp vụ, kiến trúc, kiểm thử, hiệu năng, UX/a11y, nội dung, data model, error handling, tài liệu). Nguồn prompt: PROMPT-AUDIT-MASTER.md + PROMPT-AUDIT-MODULES.md ở gốc repo."
category: quality
keywords: [audit, review, security, concurrency, testing, performance, quality, corgi7]
argument-hint: "[#N | tên-mảng | master | (trống = xem menu)]"
metadata:
  author: hao
---

# /audit — Bộ audit may-đo cho Corgi7

**Nguồn sự thật (single source, KHÔNG nhân bản):**
- `PROMPT-AUDIT-MODULES.md` — 11 module độc lập (mỗi mảng 1 block prompt).
- `PROMPT-AUDIT-MASTER.md` — prompt quét toàn bộ 11 mảng 1 lần.

Skill này chỉ **định tuyến + in menu**. Nội dung prompt LUÔN đọc từ 2 file trên.

## Định tuyến theo input

| Input của user | Hành động |
|---|---|
| (trống), `list`, `menu`, `ls` | In **MENU** (bảng dưới) + cách chạy. **KHÔNG** tự chạy audit. |
| `#N` hoặc `N` (1–11) | `Read` block `## Module N` trong `PROMPT-AUDIT-MODULES.md` → chạy đúng prompt đó lên code thật. |
| tên mảng (vd `security`, `bảo mật`, `concurrency`, `test`…) | Map sang số (bảng "Map tên → số") rồi chạy như `#N`. |
| `master`, `all`, `full`, `toàn bộ` | `Read` `PROMPT-AUDIT-MASTER.md` → quét toàn bộ 11 mảng. |

## MENU (in ra khi input trống)

| # | Mảng | Skill gọi thẳng |
|---|---|---|
| 1 | Bảo mật | `/ck:ck-security` |
| 2 | Giao dịch & concurrency | `/ck:code-review` + `/ck:ck-scenario` |
| 3 | Nghiệp vụ / luồng | `/ck:code-review` |
| 4 | Kiến trúc & code | `/ck:code-review` |
| 5 | Kiểm thử | `/ck:test` |
| 6 | Hiệu năng & bundle | `/ck:react-best-practices` |
| 7 | UX/UI & a11y | `/ck:web-design-guidelines` |
| 8 | Nội dung & i18n | `/ck:copywriting` |
| 9 | Data model & integrity | `/ck:databases` |
| 10 | Error handling & observability | `/ck:ck-debug` |
| 11 | Tài liệu | `/ck:docs` |

Cách chạy: `/audit 2` · `/audit security` · `/audit master`.

## Khi CHẠY 1 mảng (BẮT BUỘC theo thứ tự)

1. `Read` đúng block `## Module N` trong `PROMPT-AUDIT-MODULES.md` để lấy: mục tiêu, file cần đọc, điểm nóng, prompt.
2. `Read` các file nguồn module liệt kê — **bằng chứng thật, KHÔNG đoán**.
3. Khi mảng cần (vd #2 concurrency, #5 test, #6 bundle): chạy lệnh xác minh `npx tsc --noEmit`, `npx vitest run`, `npm run build` và dùng output thật làm bằng chứng.
4. Xuất báo cáo đúng **Output contract**:
   - Bảng điểm A–F.
   - Finding theo mức độ 🔴/🟠/🟡/🟢, mỗi cái: `[ID] mức độ · file:dòng · nguyên nhân gốc · cách sửa`.
   - "Kết luận thẳng" (rủi ro lớn nhất) + "Hành động ưu tiên".
   - Phân biệt **"đã kiểm chứng"** vs **"suy đoán cần xác minh"**. KHÔNG tạo cảm giác an toàn giả; phòng thủ nào chỉ là UX (client) phải nói rõ.
5. **KHÔNG** tự sửa code trừ khi user yêu cầu. **KHÔNG** deploy. **KHÔNG** đụng data live (Firestore, access-control).

## Map tên → số

1=bảo mật/security · 2=concurrency/giao dịch/transaction/race · 3=nghiệp vụ/flow/luồng/eligibility · 4=kiến trúc/code/architecture/refactor · 5=test/kiểm thử/coverage/ci · 6=hiệu năng/perf/bundle/firestore-cost · 7=ux/ui/a11y/accessibility · 8=nội dung/i18n/copy/wording · 9=data/schema/model/integrity · 10=lỗi/error/observability/logging · 11=tài liệu/docs/readme

## Lưu ý
- Sau khi tạo skill này, có thể cần **mở lại session** để Claude Code nhận diện `/audit`.
- Muốn thêm/bớt mảng → sửa `PROMPT-AUDIT-MODULES.md` (và bảng MENU ở đây nếu đổi danh sách). Không sửa logic ở nơi khác.
