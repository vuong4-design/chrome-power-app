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
- [ ] Trình tạo script kéo thả (node-based workflow builder) để tạo luồng automation không cần code.
- [ ] Thư viện node kéo thả (điều hướng, nhập liệu, chờ, điều kiện, lặp, chụp ảnh, xử lý lỗi).
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

---

## Prompt gợi ý để bắt đầu triển khai (theo từng task)

### Milestone A: Automation Script Manager

#### A1. Thiết kế dữ liệu & API
- **Prompt:** "Hãy tạo migration cho bảng `automation_scripts` và `automation_runs`, cập nhật models/DB layer tương ứng, và thêm CRUD API endpoints `/scripts` + endpoint `/scripts/run`. Yêu cầu: schema có đủ trường name/type/content/path/status/logs/window_id/script_id, có index hợp lý, và trả về JSON chuẩn hóa."

#### A2. Engine thực thi
- **Prompt:** "Hãy triển khai service chạy automation script theo window/proxy/profile hiện có. Hỗ trợ Puppeteer/Playwright/Selenium theo `type`, có batch size, timeout, và khả năng hủy job. Kèm logging chi tiết cho từng run."

#### A3. UI & quan sát
- **Prompt:** "Hãy bổ sung UI quản lý scripts (list/editor/import-export) và trang theo dõi job runs (status/log). Thêm notification khi job hoàn thành."

#### A3.1 Trình tạo script kéo thả
- **Prompt:** "Hãy xây dựng UI node-based workflow builder để tạo script bằng kéo thả. Cần có thư viện node cơ bản (navigate, click, input, wait, condition, loop, screenshot, error handling) và xuất ra cấu trúc JSON/script tương ứng."

#### A4. Bảo mật & sandbox
- **Prompt:** "Hãy bổ sung sandbox cho automation scripts: giới hạn file system access, allowlist domain/network, và validate input trước khi chạy."

### Milestone B: Proxy Health-check & Auto-rotation

#### B1. Health-check service
- **Prompt:** "Hãy triển khai service kiểm tra proxy định kỳ (latency, HTTP status, geo), lưu lịch sử và trạng thái (healthy/unhealthy/degraded), và thêm migration/schema lưu health metrics."

#### B2. API & UI
- **Prompt:** "Hãy thêm API `/proxy/health` trả về trạng thái proxy, và UI hiển thị latency/status + filter theo trạng thái."

#### B3. Auto-rotation
- **Prompt:** "Hãy triển khai auto-rotation proxy khi proxy lỗi: chọn proxy thay thế theo round-robin hoặc lowest-latency, có toggle theo window/group."

### Milestone C: Backup/Restore Window & Profile

#### C1. Export
- **Prompt:** "Hãy thêm chức năng export profiles/windows/proxies ra file zip, kèm schema version, và hỗ trợ export theo scope (all/selected)."

#### C2. Import
- **Prompt:** "Hãy thêm chức năng import file zip để khôi phục dữ liệu, có validation file, xử lý conflict (merge/replace/skip), và rollback nếu lỗi."

#### C3. UI & UX
- **Prompt:** "Hãy thêm UI Backup/Restore trong Settings với progress indicator."

### Milestone D: Audit Log & Activity History

#### D1. Logging backend
- **Prompt:** "Hãy thêm bảng `audit_logs` và middleware ghi log các thao tác CRUD window/proxy/profile (action, actor, timestamp, metadata)."

#### D2. UI hiển thị
- **Prompt:** "Hãy bổ sung UI hiển thị audit log với filter (type/time/window) và export CSV/JSON."

#### D3. Integrations
- **Prompt:** "Hãy tích hợp audit log với hệ thống logger hiện có (structured logs)."
