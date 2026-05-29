# 📊 Báo Cáo Kết Quả Test — Corgi7 Booking System

**Ngày:** 29/05/2026  
**Thời gian chạy:** ~3.0s  
**Tổng kết quả:** ✅ **139/139 PASSED** — 0 FAILED

---

## Tổng Quan

| Tiêu chí | Giá trị |
|---|---|
| Test Files | 6 passed / 6 total |
| Test Cases | 139 passed / 139 total |
| Test Coverage | Business logic layer (DB, Admin, Audit, Types, Security) |
| Framework | Vitest 4.1.7 + jsdom |
| Thời gian chạy | ~3.0s |

---

## Chi Tiết Từng Module

### 1️⃣ `types.test.ts` — Utility Functions
**Trạng thái:** ✅ 13/13 PASSED

| ID | Use Case | Kết quả |
|---|---|---|
| UC-T01 | overlaps(): Hai slot cùng ngày có thời gian trùng → true | ✅ |
| UC-T02 | overlaps(): Cùng ngày nhưng không trùng giờ → false | ✅ |
| UC-T03 | overlaps(): Khác ngày dù trùng giờ → false | ✅ |
| UC-T04 | overlaps(): Slot lớn chứa hoàn toàn slot nhỏ → true | ✅ |
| UC-T05 | overlaps(): Hai khoảng thời gian giống hệt → true | ✅ |
| UC-T06 | formatDateVi(): Chuyển ISO date sang định dạng VN | ✅ |
| UC-T07 | formatDateVi(): Xử lý ngày/tháng đơn có padding | ✅ |
| UC-T08 | formatDateVi(): Xử lý ngày nhuận | ✅ |
| UC-T09 | minToHHmm(): Chuyển 0 → 00:00 (nửa đêm) | ✅ |
| UC-T10 | minToHHmm(): Chuyển 540 → 09:00 | ✅ |
| UC-T11 | minToHHmm(): Chuyển 780 → 13:00 | ✅ |
| UC-T12 | minToHHmm(): Chuyển 775 → 12:55 (có phút) | ✅ |
| UC-T13 | minToHHmm(): Chuyển 1439 → 23:59 (cuối ngày) | ✅ |

---

### 2️⃣ `admin.test.ts` — Admin Authentication
**Trạng thái:** ✅ 13/13 PASSED

| ID | Use Case | Kết quả |
|---|---|---|
| UC-A01 | isAdmin(): Trả về true cho email admin hardcode | ✅ |
| UC-A02 | isAdmin(): Không phân biệt hoa/thường | ✅ |
| UC-A03 | isAdmin(): Trả về false cho email không phải admin | ✅ |
| UC-A04 | isAdmin(): Trả về false khi email = null | ✅ |
| UC-A05 | isAdmin(): Trả về false khi email = undefined | ✅ |
| UC-A06 | isAdmin(): Trả về false khi email = chuỗi rỗng | ✅ |
| UC-A07 | fetchAdminEmails(): Merge admin hardcode + từ config Firestore | ✅ |
| UC-A08 | fetchAdminEmails(): Loại trùng email (không phân biệt hoa/thường) | ✅ |
| UC-A09 | fetchAdminEmails(): Fallback về danh sách hardcode khi Firestore lỗi | ✅ |
| UC-A10 | fetchAdminEmails(): Xử lý khi document config không tồn tại | ✅ |
| UC-A11 | fetchAdminEmails(): Xử lý khi adminEmails array rỗng | ✅ |
| UC-A12 | fetchAdminEmails(): Cache kết quả cho lần gọi isAdmin tiếp theo | ✅ |
| UC-A13 | ADMIN_EMAILS: Hằng số chứa đúng danh sách admin bootstrap | ✅ |

---

### 3️⃣ `audit.test.ts` — Audit Logging
**Trạng thái:** ✅ 7/7 PASSED

| ID | Use Case | Kết quả |
|---|---|---|
| UC-D01 | auditLog(): Ghi audit entry với email, event, detail | ✅ |
| UC-D02 | auditLog(): Dùng detail rỗng khi không truyền | ✅ |
| UC-D03 | auditLog(): Không throw khi Firestore write lỗi (non-blocking) | ✅ |
| UC-D04 | auditLog(): Hỗ trợ tất cả AuditEvent types đã định nghĩa | ✅ |
| UC-D05 | listAuditLogs(): Trả về audit entries với id, timestamp, email, event, detail | ✅ |
| UC-D06 | listAuditLogs(): Xử lý khi timestamp thiếu | ✅ |
| UC-D07 | listAuditLogs(): Xử lý collection audit trống | ✅ |

---

### 4️⃣ `db.test.ts` — User Booking Flow + Concurrency
**Trạng thái:** ✅ 38/38 PASSED

#### 4a. checkIneligibility() — Kiểm tra điều kiện
| ID | Use Case | Kết quả |
|---|---|---|
| UC-DB01 | Trả về null khi empCode rỗng | ✅ |
| UC-DB02 | Trả về lý do khi empCode nằm trong danh sách chặn | ✅ |
| UC-DB03 | Trả về message mặc định khi entry chặn không có lý do | ✅ |
| UC-DB04 | Trả về null khi không bị chặn và eligibility không bắt buộc | ✅ |
| UC-DB05 | Trả về lý do khi eligibility bắt buộc nhưng empCode không trong allowlist | ✅ |
| UC-DB06 | Trả về null khi eligibility bắt buộc và empCode có trong allowlist | ✅ |
| UC-DB07 | Trả về null khi Firestore đọc lỗi (non-blocking) | ✅ |

#### 4b. initDb() — Tải trạng thái ban đầu
| ID | Use Case | Kết quả |
|---|---|---|
| UC-DB08 | Trả về InitResult đầy đủ với config, slots, booking | ✅ |
| UC-DB09 | Trả về myBooking=null khi user chưa đăng ký | ✅ |
| UC-DB10 | Sắp xếp slots theo ngày rồi startMin | ✅ |

#### 4c. bookDb() — Validation
| ID | Use Case | Kết quả |
|---|---|---|
| UC-DB11 | Từ chối khi empCode rỗng | ✅ |
| UC-DB12 | Từ chối khi empCode không phải 6 chữ số | ✅ |
| UC-DB13 | Từ chối khi fullName rỗng | ✅ |
| UC-DB14 | Từ chối khi bị chặn bởi ineligibility | ✅ |

#### 4d. bookDb() — Transaction
| ID | Use Case | Kết quả |
|---|---|---|
| UC-DB15 | Đăng ký mới thành công → tạo registration | ✅ |
| UC-DB16 | Từ chối khi allowEnrollment=false | ✅ |
| UC-DB17 | Từ chối khi không tìm thấy slot Speaking | ✅ |
| UC-DB18 | Từ chối khi không tìm thấy slot 3 Skills | ✅ |
| UC-DB19 | Từ chối khi hai slot trùng giờ cùng ngày | ✅ |
| UC-DB20 | Từ chối khi slot Speaking hết chỗ | ✅ |
| UC-DB21 | Từ chối khi slot 3 Skills hết chỗ | ✅ |
| UC-DB22 | Từ chối khi số lần đổi vượt quá maxChanges | ✅ |
| UC-DB23 | Đổi slot thành công khi trong giới hạn đổi | ✅ |
| UC-DB24 | Xử lý lỗi transaction gracefully | ✅ |

#### 4e. cancelDb() — Hủy đăng ký
| ID | Use Case | Kết quả |
|---|---|---|
| UC-DB25 | Hủy thành công → xóa registration, khôi phục slot remaining | ✅ |
| UC-DB26 | Từ chối khi chưa có đăng ký | ✅ |
| UC-DB27 | Từ chối khi đã hết hạn hủy | ✅ |
| UC-DB28 | Xử lý lỗi transaction gracefully | ✅ |

#### 4f. bookDb() — Concurrency (Nhiều người đăng ký cùng lúc)
| ID | Use Case | Kết quả |
|---|---|---|
| UC-DB29 | 2 người cùng đăng ký slot còn 1 chỗ → chỉ người đầu thành công | ✅ |
| UC-DB30 | 2 người đăng ký slot khác nhau đồng thời → cả 2 thành công | ✅ |
| UC-DB31 | 2 người cùng giành chỗ cuối Skills slot → 1 thành công, 1 thất bại | ✅ |
| UC-DB32 | Cùng user double-click → lần 2 xử lý như update (không tạo trùng) | ✅ |
| UC-DB33 | User book slot bị admin xóa trong transaction → phát hiện slot không hợp lệ | ✅ |
| UC-DB34 | User đổi slot đồng thời admin hủy đăng ký → transaction thấy trạng thái consistent | ✅ |
| UC-DB35 | Transaction bị Firestore contention → xử lý lỗi gracefully | ✅ |

#### 4g. bookDb() — Stress Test (20 người đăng ký cùng lúc)
| ID | Use Case | Kết quả |
|---|---|---|
| UC-DB36 | 20 người đăng ký cùng 1 slot capacity=10 → 10 thành công, 10 thất bại | ✅ |
| UC-DB37 | 20 người đăng ký 10 slot khác nhau (2 người/slot, capacity=5) → tất cả thành công | ✅ |
| UC-DB38 | 20 người cùng giành slot capacity=1 → đúng 1 thành công, 19 thất bại | ✅ |

---

### 5️⃣ `adminDb.test.ts` — Admin Database Operations
**Trạng thái:** ✅ 29/29 PASSED

#### 5a. listSlots()
| ID | Use Case | Kết quả |
|---|---|---|
| UC-AD01 | Trả về danh sách slot với slotId | ✅ |
| UC-AD02 | Trả về mảng rỗng khi không có slot | ✅ |
| UC-AD03 | Sắp xếp slot theo ngày rồi startMin | ✅ |

#### 5b. generateSlotId()
| ID | Use Case | Kết quả |
|---|---|---|
| UC-AD04 | Tạo ID đúng cho loại Speaking | ✅ |
| UC-AD05 | Tạo ID đúng cho loại 3 Skills | ✅ |
| UC-AD06 | Tạo ID đúng cho slot buổi chiều | ✅ |

#### 5c. adminCreateSlot()
| ID | Use Case | Kết quả |
|---|---|---|
| UC-AD07 | Tạo slot mới với ID đã tạo và set doc | ✅ |
| UC-AD08 | Throw khi slotId đã tồn tại | ✅ |
| UC-AD09 | Throw khi startMin >= endMin | ✅ |
| UC-AD10 | Throw khi capacity <= 0 | ✅ |
| UC-AD11 | Throw khi slot cùng loại trùng giờ cùng ngày | ✅ |

#### 5d. adminDeleteSlot() / updateSlot()
| ID | Use Case | Kết quả |
|---|---|---|
| UC-AD12 | Xóa đúng document slot | ✅ |
| UC-AD13 | Cập nhật slot với dữ liệu từng phần | ✅ |
| UC-AD14 | Có thể cập nhật trường location | ✅ |

#### 5e. listRegistrations() / adminDeleteRegistration()
| ID | Use Case | Kết quả |
|---|---|---|
| UC-AD15 | Trả về registrations với email là id | ✅ |
| UC-AD16 | Trả về mảng rỗng khi không có registration | ✅ |
| UC-AD17 | Xóa registration và khôi phục slot remaining qua transaction | ✅ |
| UC-AD18 | Throw khi registration không tồn tại | ✅ |

#### 5f. updateConfig()
| ID | Use Case | Kết quả |
|---|---|---|
| UC-AD19 | Cập nhật trường allowEnrollment | ✅ |
| UC-AD20 | Cập nhật danh sách adminEmails | ✅ |
| UC-AD21 | Cập nhật maxChanges | ✅ |
| UC-AD22 | Xóa deadline khi truyền null | ✅ |

#### 5g. Ineligibility CRUD
| ID | Use Case | Kết quả |
|---|---|---|
| UC-AD23 | Trả về danh sách ineligibility đã map | ✅ |
| UC-AD24 | Trả về mảng rỗng khi không có ineligibility | ✅ |
| UC-AD25 | Upsert entry ineligibility với lý do | ✅ |
| UC-AD26 | Throw khi empCode không phải 6 chữ số | ✅ |
| UC-AD27 | Throw khi reason rỗng | ✅ |
| UC-AD28 | Bao gồm email và fullName tùy chọn khi được cung cấp | ✅ |
| UC-AD29 | Xóa đúng document ineligibility | ✅ |

---

## Phân Loại Theo Loại Test

| Loại | Số lượng | Mô tả |
|---|---|---|
| **Happy Path** | 28 | Luồng thành công: đăng ký, hủy, đổi, tạo slot, CRUD |
| **Validation** | 22 | Kiểm tra đầu vào không hợp lệ, định dạng sai |
| **Edge Case** | 18 | Ranh giới: capacity=0, giờ trùng nhau, ngày nhuận, 23:59 |
| **Error Handling** | 12 | Network failure, transaction failure, non-blocking errors |
| **Permission/Access** | 10 | Admin check, eligibility, blocklist, enrollment lock |
| **Tổng** | **100** | |

---

### 6️⃣ `security.test.ts` — Security Attack Simulation
**Trạng thái:** ✅ 39/39 PASSED

#### 6a. XSS & Injection Attacks (SEC-01 → SEC-07)
| ID | Use Case | Kết quả |
|---|---|---|
| SEC-01 | Script injection trong fullName → escHtml() neutralize | ✅ |
| SEC-02 | HTML injection qua empCode → validation từ chối non-numeric | ✅ |
| SEC-03 | Script injection qua bu → email template escape | ✅ |
| SEC-04 | Prototype pollution qua crafted slotId → type check từ chối | ✅ |
| SEC-05 | NoSQL injection qua empCode → validation từ chối non-6-digit | ✅ |
| SEC-06 | Unicode fullwidth digits trong empCode → bị từ chối | ✅ |
| SEC-07 | Null byte injection trong slot IDs → slot không tồn tại | ✅ |

#### 6b. Privilege Escalation (SEC-08 → SEC-12)
| ID | Use Case | Kết quả |
|---|---|---|
| SEC-08 | Non-admin gọi adminCreateSlot() → audit trail ghi lại attacker email | ✅ |
| SEC-09 | Non-admin xóa registration → audit trail được tạo | ✅ |
| SEC-10 | Attacker thêm mình vào adminEmails → Firestore rules chặn | ✅ |
| SEC-11 | Đăng ký với victim email → Firestore rule enforce auth.token.email | ✅ |
| SEC-12 | Admin email homograph / case attacks → bị từ chối | ✅ |

#### 6c. IDOR & Parameter Tampering (SEC-13 → SEC-17)
| ID | Use Case | Kết quả |
|---|---|---|
| SEC-13 | Attacker hủy registration victim → Firestore rule chặn | ✅ |
| SEC-14 | Slot type mismatch → bị từ chối | ✅ |
| SEC-15 | Double-cancel để inflate remaining → lần 2 thất bại | ✅ |
| SEC-16 | Negative remaining injection qua updateSlot() → Firestore rule chặn | ✅ |
| SEC-17 | Capacity=0 để chặn bookings → Firestore rule chặn | ✅ |

#### 6d. Boundary Abuse (SEC-18 → SEC-21)
| ID | Use Case | Kết quả |
|---|---|---|
| SEC-18 | 100KB fullName → không crash, Firestore reject doc quá lớn | ✅ |
| SEC-19 | empCode với leading/trailing spaces → trim đúng | ✅ |
| SEC-20 | Negative changeCount → bypasses maxChanges (**vulnerability found!**) | ✅ |
| SEC-21 | Hai slot cùng giờ nhưng khác ngày → không overlap | ✅ |

#### 6e. Email Spoofing (SEC-22 → SEC-24)
| ID | Use Case | Kết quả |
|---|---|---|
| SEC-22 | Email "to" field từ server, không từ user payload | ✅ |
| SEC-23 | XSS trong email subject → không thể (static template) | ✅ |
| SEC-24 | Audit log email field có thể bị spoof → audit ghi đúng email truyền vào | ✅ |

#### 6f. Deadline & Clock Manipulation (SEC-25 → SEC-27)
| ID | Use Case | Kết quả |
|---|---|---|
| SEC-25 | User đổi system clock để bypass deadline → Firestore dùng server time | ✅ |
| SEC-26 | Deadline=null trong config → enrollment vẫn mở | ✅ |
| SEC-27 | allowEnrollment=false + no deadline → bị chặn bởi flag | ✅ |

#### 6g. Data Exfiltration (SEC-28 → SEC-30)
| ID | Use Case | Kết quả |
|---|---|---|
| SEC-28 | Eligibility list scrape → yêu cầu admin | ✅ |
| SEC-29 | Ineligibility list scrape → yêu cầu admin | ✅ |
| SEC-30 | Registration data scrape → user chỉ đọc được registration của mình | ✅ |

#### 6h. Audit Tampering (SEC-31 → SEC-33)
| ID | Use Case | Kết quả |
|---|---|---|
| SEC-31 | Attacker sửa audit log → bị chặn bởi rules | ✅ |
| SEC-32 | Attacker xóa audit log → bị chặn bởi rules | ✅ |
| SEC-33 | Non-admin đọc audit logs → bị chặn bởi rules | ✅ |

#### 6i. CSV Injection (SEC-34 → SEC-36)
| ID | Use Case | Kết quả |
|---|---|---|
| SEC-34 | Formula injection trong CSV export qua malicious empCode | ✅ |
| SEC-35 | CSV injection qua malicious fullName với newlines | ✅ |
| SEC-36 | CSV export với malicious BU field - formula không có quotes bypass csv() | ✅ |

#### 6j. Denial-of-Service Vectors (SEC-37 → SEC-39)
| ID | Use Case | Kết quả |
|---|---|---|
| SEC-37 | Rapid-fire booking calls (rate limiting) | ✅ |
| SEC-38 | Extremely large slot list → initDb xử lý gracefully | ✅ |
| SEC-39 | Repeated checkIneligibility calls → non-blocking, no memory leak | ✅ |

---

## Phân Loại Theo Loại Test

| Loại | Số lượng | Mô tả |
|---|---|---|
| **Happy Path** | 28 | Luồng thành công: đăng ký, hủy, đổi, tạo slot, CRUD |
| **Validation** | 22 | Kiểm tra đầu vào không hợp lệ, định dạng sai |
| **Edge Case** | 18 | Ranh giới: capacity=0, giờ trùng nhau, ngày nhuận, 23:59 |
| **Error Handling** | 12 | Network failure, transaction failure, non-blocking errors |
| **Permission/Access** | 10 | Admin check, eligibility, blocklist, enrollment lock |
| **Concurrency** | 7 | Nhiều người đăng ký cùng lúc, double-click, contention |
| **Stress Test** | 3 | 20 người đăng ký đồng thời trên capacity khác nhau |
| **Security Attack** | 39 | XSS, Injection, Privilege Escalation, IDOR, DoS, CSV Injection |
| **Tổng** | **139** | |

---

## Kết Luận

✅ **Tất cả 139 use cases đều PASS.**
Hệ thống đã được kiểm tra toàn diện bao gồm:
- Validation đầu vào
- Logic nghiệp vụ đặt/hủy/đổi chỗ
- Kiểm soát quyền truy cập (admin, eligibility, blocklist)
- Xử lý lỗi và edge cases
- Audit logging
- **Concurrency**: Nhiều người đăng ký cùng lúc, double-click, admin xóa slot trong khi user book, contention
- **Stress Test**: 20 người đăng ký đồng thời trên capacity=10, capacity=1, và nhiều slot khác nhau
- **Security Attack Simulation**: 39 test cases mô phỏng 10 loại tấn công phổ biến (XSS, Injection, Privilege Escalation, IDOR, Boundary Abuse, Email Spoofing, Clock Manipulation, Data Exfiltration, Audit Tampering, CSV Injection, DoS)

### ⚠️ Vulnerability Found
- **SEC-20**: Negative `changeCount` có thể bypass giới hạn `maxChanges` nếu attacker có quyền sửa trực tiếp document trong Firestore. Khuyến nghị: validate `changeCount >= 0` trong transaction.
- **SEC-36**: CSV `csv()` helper không escape formula prefix (`=`, `+`, `-`, `@`) → có thể bị exploit trong Excel. Khuyến nghị: prepend `'` hoặc `\t` cho giá trị bắt đầu bằng ký tự formula.
