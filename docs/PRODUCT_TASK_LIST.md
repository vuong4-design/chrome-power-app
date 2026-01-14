# Task list: 기능 bổ sung để hoàn thiện sản phẩm

Tài liệu này triển khai chi tiết task list cho các tính năng nên bổ sung để hoàn thiện sản phẩm, dựa trên đề xuất ưu tiên cao và nhu cầu hoàn thiện sản phẩm.

## Milestone A: Automation Script Manager (Ưu tiên cao)

**Mục tiêu:** Cho phép người dùng tạo, lưu trữ, chạy, và theo dõi các script tự động hóa (Puppeteer/Playwright/Selenium) theo từng window/profile.

### A1. Thiết kế dữ liệu & API
- [ ] Thêm bảng `automation_scripts` (metadata: name, type, content/path, created_at, updated_at).
- [ ] Thêm bảng `automation_runs` (status, started_at, finished_at, logs, window_id, script_id).
- [ ] API CRUD cho script (`/scripts`): create, update, delete, list, get-by-id.
- [ ] API chạy script (`/scripts/run`): input windowIds, scriptId, options.

### A2. Engine thực thi
- [ ] Thêm service chạy script theo window/proxy/profile hiện có.
- [ ] Hỗ trợ 3 backend: Puppeteer/Playwright/Selenium (config via type).
- [ ] Cho phép chạy song song theo batch size.
- [ ] Job cancellation và timeout.

### A3. UI & quan sát
- [ ] UI quản lý script (list, editor, import/export).
- [ ] UI theo dõi trạng thái chạy (success/fail, log).
- [ ] Notification khi job hoàn thành.

### A4. Bảo mật & sandbox
- [ ] Hạn chế quyền truy cập file system cho script.
- [ ] Hạn chế network target (allowlist domain).

---

## Milestone B: Proxy Health-check & Auto-rotation

**Mục tiêu:** Theo dõi chất lượng proxy, tự động loại bỏ proxy lỗi và thay thế khi tạo window.

### B1. Health-check service
- [ ] Service định kỳ kiểm tra proxy (latency, HTTP status, geo).
- [ ] Lưu lịch sử trạng thái và đo uptime.
- [ ] Cờ trạng thái: healthy/unhealthy/degraded.

### B2. API & UI
- [ ] API truy vấn trạng thái proxy (`/proxy/health`).
- [ ] UI hiển thị trạng thái proxy, latency.
- [ ] Filter proxy theo trạng thái.

### B3. Auto-rotation
- [ ] Khi proxy lỗi → tự chọn proxy khác (policy: round-robin/lowest-latency).
- [ ] Tùy chọn bật/tắt auto-rotation theo nhóm/window.

---

## Milestone C: Backup/Restore Window & Profile

**Mục tiêu:** Cho phép người dùng sao lưu và phục hồi dữ liệu windows/profiles/proxies.

### C1. Export
- [ ] Export profiles, windows, proxies thành file zip.
- [ ] Kèm phiên bản schema để tránh incompatibility.
- [ ] Cho phép export theo scope: all / selected.

### C2. Import
- [ ] Import zip và khôi phục dữ liệu.
- [ ] Xử lý conflict (merge/replace/skip).
- [ ] Validation file trước khi import.

### C3. UI & UX
- [ ] UI nút Backup/Restore trong Settings.
- [ ] Progress indicator và rollback nếu lỗi.

---

## Milestone D: Audit Log & Activity History

**Mục tiêu:** Ghi lại lịch sử thao tác để dễ truy vết và debug.

### D1. Logging backend
- [ ] Bảng `audit_logs` (action, actor, timestamp, metadata).
- [ ] Middleware log cho các hành động CRUD của window/proxy/profile.

### D2. UI hiển thị
- [ ] UI lịch sử thao tác theo filter (type/time/window).
- [ ] Export log ra CSV/JSON.

### D3. Integrations
- [ ] Tích hợp với logger hệ thống (structured logs).

---

## Tài nguyên & phụ thuộc

- Các milestone có thể triển khai song song, nhưng Milestone A nên ưu tiên vì đây là tính năng được nêu rõ là còn thiếu.
- Milestone B và D cần bổ sung schema DB và migration.
- Milestone C cần xử lý file I/O và cơ chế import/export an toàn.
