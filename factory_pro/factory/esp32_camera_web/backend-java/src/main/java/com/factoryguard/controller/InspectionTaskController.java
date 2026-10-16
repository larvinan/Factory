package com.factoryguard.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryguard.mapper.InspectionCheckinMapper;
import com.factoryguard.mapper.InspectionPointMapper;
import com.factoryguard.mapper.InspectionTaskMapper;
import com.factoryguard.mapper.WorkshopMapper;
import com.factoryguard.model.InspectionCheckin;
import com.factoryguard.model.InspectionPoint;
import com.factoryguard.model.InspectionTask;
import com.factoryguard.model.Workshop;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 巡检任务管理接口
 */
@RestController
@RequestMapping("/api/inspection-tasks")
public class InspectionTaskController {

    private final InspectionTaskMapper taskMapper;
    private final WorkshopMapper workshopMapper;
    private final InspectionPointMapper pointMapper;
    private final InspectionCheckinMapper checkinMapper;
    private final ObjectMapper objectMapper;

    public InspectionTaskController(InspectionTaskMapper taskMapper,
                                   WorkshopMapper workshopMapper,
                                   InspectionPointMapper pointMapper,
                                   InspectionCheckinMapper checkinMapper,
                                   ObjectMapper objectMapper) {
        this.taskMapper = taskMapper;
        this.workshopMapper = workshopMapper;
        this.pointMapper = pointMapper;
        this.checkinMapper = checkinMapper;
        this.objectMapper = objectMapper;
    }

    /** 获取巡检任务列表 */
    @GetMapping
    public Map<String, Object> getList(
            @RequestParam(required = false) Long workshopId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority) {
        try {
            QueryWrapper<InspectionTask> qw = new QueryWrapper<>();
            if (workshopId != null) {
                qw.eq("workshop_id", workshopId);
            }
            if (status != null && !status.isEmpty()) {
                qw.eq("status", status);
            }
            if (priority != null && !priority.isEmpty()) {
                qw.eq("priority", priority);
            }
            qw.orderByDesc("priority").orderByAsc("scheduled_date");
            List<InspectionTask> tasks = taskMapper.selectList(qw);

            Map<Long, String> workshopNames = new HashMap<>();
            for (InspectionTask t : tasks) {
                if (t.getWorkshopId() != null && !workshopNames.containsKey(t.getWorkshopId())) {
                    Workshop w = workshopMapper.selectById(t.getWorkshopId());
                    workshopNames.put(t.getWorkshopId(), w != null ? w.getName() : "未知车间");
                }
            }

            List<Map<String, Object>> data = new ArrayList<>();
            for (InspectionTask t : tasks) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", t.getId());
                item.put("workshopId", t.getWorkshopId());
                item.put("workshopName", workshopNames.get(t.getWorkshopId()));
                item.put("title", t.getTitle());
                item.put("description", t.getDescription());
                item.put("inspectorName", t.getInspectorName());
                item.put("status", t.getStatus());
                item.put("priority", t.getPriority());
                item.put("scheduledDate", t.getScheduledDate());
                item.put("dueDate", t.getDueDate());
                item.put("itemsJson", t.getItemsJson());
                item.put("resultNote", t.getResultNote());
                item.put("completedAt", t.getCompletedAt());
                item.put("createdAt", t.getCreatedAt());
                data.add(item);
            }

            Map<String, Object> result = new HashMap<>();
            result.put("status", "ok");
            result.put("data", data);
            return result;
        } catch (Exception e) {
            Map<String, Object> err = new HashMap<>();
            err.put("status", "error");
            err.put("message", e.getClass().getSimpleName() + ": " + e.getMessage());
            return err;
        }
    }

    /** 获取巡检任务详情 */
    @GetMapping("/{id}")
    public Map<String, Object> getById(@PathVariable Long id) {
        InspectionTask task = taskMapper.selectById(id);
        Map<String, Object> result = new HashMap<>();
        if (task == null) {
            result.put("status", "error");
            result.put("message", "任务不存在");
        } else {
            Workshop workshop = workshopMapper.selectById(task.getWorkshopId());
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", task.getId());
            data.put("workshopId", task.getWorkshopId());
            data.put("workshopName", workshop != null ? workshop.getName() : "未知车间");
            data.put("title", task.getTitle());
            data.put("description", task.getDescription());
            data.put("inspectorOpenid", task.getInspectorOpenid());
            data.put("inspectorName", task.getInspectorName());
            data.put("status", task.getStatus());
            data.put("priority", task.getPriority());
            data.put("scheduledDate", task.getScheduledDate());
            data.put("dueDate", task.getDueDate());
            data.put("itemsJson", task.getItemsJson());
            data.put("resultNote", task.getResultNote());
            data.put("completedAt", task.getCompletedAt());
            data.put("createdAt", task.getCreatedAt());
            result.put("status", "ok");
            result.put("data", data);
        }
        return result;
    }

    /** 获取任务关联的巡检点位 + 打卡状态 */
    @GetMapping("/{taskId}/points")
    public Map<String, Object> getTaskPoints(@PathVariable Long taskId) {
        InspectionTask task = taskMapper.selectById(taskId);
        if (task == null) {
            Map<String, Object> r = new HashMap<>();
            r.put("status", "error");
            r.put("message", "任务不存在");
            return r;
        }

        // 查询该车间的所有活跃点位
        QueryWrapper<InspectionPoint> pw = new QueryWrapper<>();
        pw.eq("workshop_id", task.getWorkshopId());
        pw.eq("status", "active");
        pw.orderByAsc("sort_order");
        List<InspectionPoint> points = pointMapper.selectList(pw);

        // 查询该任务已有的打卡记录
        QueryWrapper<InspectionCheckin> cw = new QueryWrapper<>();
        cw.eq("task_id", taskId);
        List<InspectionCheckin> checkins = checkinMapper.selectList(cw);

        // 点位ID → 打卡记录映射
        Map<Long, InspectionCheckin> checkinMap = new HashMap<>();
        for (InspectionCheckin c : checkins) {
            checkinMap.put(c.getPointId(), c);
        }

        List<Map<String, Object>> pointList = new ArrayList<>();
        int requiredTotal = 0;
        int requiredChecked = 0;
        for (InspectionPoint p : points) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", p.getId());
            item.put("code", p.getCode());
            item.put("name", p.getName());
            item.put("location", p.getLocation());
            item.put("required", p.getRequired() != null && p.getRequired() == 1);
            item.put("sortOrder", p.getSortOrder());

            InspectionCheckin checkin = checkinMap.get(p.getId());
            item.put("checkedIn", checkin != null);
            item.put("checkinTime", checkin != null ? checkin.getCheckinTime() : null);
            item.put("inspectorName", checkin != null ? checkin.getInspectorName() : null);

            if (p.getRequired() != null && p.getRequired() == 1) {
                requiredTotal++;
                if (checkin != null) requiredChecked++;
            }
            pointList.add(item);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("points", pointList);
        data.put("requiredTotal", requiredTotal);
        data.put("requiredChecked", requiredChecked);
        data.put("allChecked", requiredTotal > 0 && requiredChecked == requiredTotal);
        data.put("totalPoints", points.size());
        data.put("totalChecked", checkins.size());

        Map<String, Object> result = new HashMap<>();
        result.put("status", "ok");
        result.put("data", data);
        return result;
    }

    /** 扫码打卡 */
    @PostMapping("/{taskId}/checkin")
    public Map<String, Object> checkin(@PathVariable Long taskId, @RequestBody Map<String, Object> body) {
        InspectionTask task = taskMapper.selectById(taskId);
        if (task == null) {
            Map<String, Object> r = new HashMap<>();
            r.put("status", "error");
            r.put("message", "任务不存在");
            return r;
        }

        // 任务必须处于进行中状态才能打卡
        if (!"in_progress".equals(task.getStatus()) && !"assigned".equals(task.getStatus())) {
            Map<String, Object> r = new HashMap<>();
            r.put("status", "error");
            r.put("message", "任务当前状态不允许打卡，请先开始巡检");
            return r;
        }

        // 从请求体中获取点位信息（二维码内容解析后传入）
        Long pointId = null;
        String pointCode = null;
        Object pointIdObj = body.get("pointId");
        if (pointIdObj != null) {
            pointId = Long.valueOf(String.valueOf(pointIdObj));
        }
        Object codeObj = body.get("code");
        if (codeObj != null) {
            pointCode = String.valueOf(codeObj);
        }

        // 如果只有 code，通过 code 查点位
        InspectionPoint point = null;
        if (pointId != null) {
            point = pointMapper.selectById(pointId);
        } else if (pointCode != null) {
            QueryWrapper<InspectionPoint> pw = new QueryWrapper<>();
            pw.eq("code", pointCode);
            point = pointMapper.selectOne(pw);
        }

        if (point == null) {
            Map<String, Object> r = new HashMap<>();
            r.put("status", "error");
            r.put("message", "无效的巡检点位");
            return r;
        }

        // 校验点位属于任务所在车间
        if (!point.getWorkshopId().equals(task.getWorkshopId())) {
            Map<String, Object> r = new HashMap<>();
            r.put("status", "error");
            r.put("message", "该点位不属于任务所在车间");
            return r;
        }

        // 检查是否已打卡（防重复）
        QueryWrapper<InspectionCheckin> cw = new QueryWrapper<>();
        cw.eq("task_id", taskId);
        cw.eq("point_id", point.getId());
        Long existCount = checkinMapper.selectCount(cw);
        if (existCount > 0) {
            Map<String, Object> r = new HashMap<>();
            r.put("status", "error");
            r.put("message", "该点位已打卡，无需重复打卡");
            return r;
        }

        // 如果任务是 assigned 状态，自动改为 in_progress
        if ("assigned".equals(task.getStatus())) {
            task.setStatus("in_progress");
            taskMapper.updateById(task);
        }

        // 插入打卡记录
        InspectionCheckin checkin = new InspectionCheckin();
        checkin.setTaskId(taskId);
        checkin.setPointId(point.getId());
        checkin.setPointCode(point.getCode());
        checkin.setPointName(point.getName());
        checkin.setInspectorName(task.getInspectorName() != null ? task.getInspectorName() : "巡检员");
        checkin.setCheckinTime(LocalDateTime.now());
        checkinMapper.insert(checkin);

        // 检查是否所有必检点位都已打卡
        QueryWrapper<InspectionPoint> reqPw = new QueryWrapper<>();
        reqPw.eq("workshop_id", task.getWorkshopId());
        reqPw.eq("status", "active");
        reqPw.eq("required", 1);
        List<InspectionPoint> requiredPoints = pointMapper.selectList(reqPw);

        QueryWrapper<InspectionCheckin> doneCw = new QueryWrapper<>();
        doneCw.eq("task_id", taskId);
        List<InspectionCheckin> allCheckins = checkinMapper.selectList(doneCw);
        Set<Long> checkedPointIds = new HashSet<>();
        for (InspectionCheckin c : allCheckins) {
            checkedPointIds.add(c.getPointId());
        }

        int requiredTotal = requiredPoints.size();
        int requiredChecked = 0;
        for (InspectionPoint rp : requiredPoints) {
            if (checkedPointIds.contains(rp.getId())) requiredChecked++;
        }

        boolean allDone = requiredTotal > 0 && requiredChecked == requiredTotal;

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("pointName", point.getName());
        data.put("pointCode", point.getCode());
        data.put("checkinTime", checkin.getCheckinTime());
        data.put("requiredTotal", requiredTotal);
        data.put("requiredChecked", requiredChecked);
        data.put("allChecked", allDone);

        // 全部必检点位打卡完成 → 自动标记任务完成
        if (allDone) {
            task.setStatus("completed");
            task.setCompletedAt(LocalDateTime.now());
            task.setResultNote("全部必检点位已扫码打卡完成，自动标记完成");
            taskMapper.updateById(task);
            data.put("autoCompleted", true);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("status", "ok");
        result.put("message", allDone ? "打卡成功！全部必检点位已完成，巡检任务已自动完成" : "打卡成功");
        result.put("data", data);
        return result;
    }

    /** 创建巡检任务 */
    @PostMapping
    public Map<String, Object> create(@RequestBody InspectionTask task) {
        if (task.getStatus() == null) task.setStatus("pending");
        if (task.getPriority() == null) task.setPriority("normal");
        if (task.getWorkshopId() == null) task.setWorkshopId(1L);
        taskMapper.insert(task);

        Map<String, Object> result = new HashMap<>();
        result.put("status", "ok");
        result.put("data", task);
        result.put("message", "巡检任务创建成功");
        return result;
    }

    /** 分配巡检人 */
    @PutMapping("/{id}/assign")
    public Map<String, Object> assign(@PathVariable Long id, @RequestBody Map<String, String> body) {
        InspectionTask task = taskMapper.selectById(id);
        if (task == null) {
            Map<String, Object> r = new HashMap<>();
            r.put("status", "error");
            r.put("message", "任务不存在");
            return r;
        }
        task.setInspectorName(body.get("inspectorName"));
        task.setInspectorOpenid(body.get("inspectorOpenid"));
        task.setStatus("assigned");
        taskMapper.updateById(task);

        Map<String, Object> result = new HashMap<>();
        result.put("status", "ok");
        result.put("message", "分配成功");
        return result;
    }

    /** 开始巡检 */
    @PutMapping("/{id}/start")
    public Map<String, Object> start(@PathVariable Long id) {
        InspectionTask task = taskMapper.selectById(id);
        if (task == null) {
            Map<String, Object> r = new HashMap<>();
            r.put("status", "error");
            r.put("message", "任务不存在");
            return r;
        }
        task.setStatus("in_progress");
        taskMapper.updateById(task);

        Map<String, Object> result = new HashMap<>();
        result.put("status", "ok");
        result.put("message", "巡检已开始");
        return result;
    }

    /** 完成巡检 */
    @PutMapping("/{id}/complete")
    public Map<String, Object> complete(@PathVariable Long id, @RequestBody Map<String, String> body) {
        InspectionTask task = taskMapper.selectById(id);
        if (task == null) {
            Map<String, Object> r = new HashMap<>();
            r.put("status", "error");
            r.put("message", "任务不存在");
            return r;
        }
        task.setStatus("completed");
        task.setResultNote(body.get("resultNote"));
        task.setCompletedAt(LocalDateTime.now());
        taskMapper.updateById(task);

        Map<String, Object> result = new HashMap<>();
        result.put("status", "ok");
        result.put("message", "巡检已完成");
        return result;
    }

    /** 取消任务 */
    @PutMapping("/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable Long id) {
        InspectionTask task = taskMapper.selectById(id);
        if (task == null) {
            Map<String, Object> r = new HashMap<>();
            r.put("status", "error");
            r.put("message", "任务不存在");
            return r;
        }
        task.setStatus("cancelled");
        taskMapper.updateById(task);

        Map<String, Object> result = new HashMap<>();
        result.put("status", "ok");
        result.put("message", "任务已取消");
        return result;
    }

    /** 获取巡检统计 */
    @GetMapping("/stats")
    public Map<String, Object> getStats() {
        Map<String, Object> result = new HashMap<>();
        result.put("status", "ok");

        Map<String, Object> data = new HashMap<>();
        for (String s : Arrays.asList("pending", "assigned", "in_progress", "completed", "cancelled")) {
            QueryWrapper<InspectionTask> qw = new QueryWrapper<>();
            qw.eq("status", s);
            data.put(s, taskMapper.selectCount(qw));
        }
        QueryWrapper<InspectionTask> dueQw = new QueryWrapper<>();
        dueQw.le("due_date", new Date()).ne("status", "completed").ne("status", "cancelled");
        data.put("dueToday", taskMapper.selectCount(dueQw));

        result.put("data", data);
        return result;
    }
}
