package com.factoryguard.model;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;

/**
 * 智能联动规则（设计参考 Home Assistant 的 Trigger-Action 自动化模式）
 * 触发：field + operator + threshold；动作：向硬件下发 action_method + action_params
 */
@TableName("automation_rules")
public class AutomationRule {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;
    private String field;
    private String operator;
    private Double threshold;

    /** JSON 键为 snake_case（与前端/协议一致），必须显式映射否则反序列化为 null */
    @JsonProperty("action_method")
    private String actionMethod;

    @JsonProperty("action_params")
    private String actionParams;

    private Integer enabled;
    private Integer lastState;
    private LocalDateTime lastFiredAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    // ====== getters & setters ======

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getField() { return field; }
    public void setField(String field) { this.field = field; }

    public String getOperator() { return operator; }
    public void setOperator(String operator) { this.operator = operator; }

    public Double getThreshold() { return threshold; }
    public void setThreshold(Double threshold) { this.threshold = threshold; }

    public String getActionMethod() { return actionMethod; }
    public void setActionMethod(String actionMethod) { this.actionMethod = actionMethod; }

    public String getActionParams() { return actionParams; }
    public void setActionParams(String actionParams) { this.actionParams = actionParams; }

    public Integer getEnabled() { return enabled; }
    public void setEnabled(Integer enabled) { this.enabled = enabled; }

    public Integer getLastState() { return lastState; }
    public void setLastState(Integer lastState) { this.lastState = lastState; }

    public LocalDateTime getLastFiredAt() { return lastFiredAt; }
    public void setLastFiredAt(LocalDateTime lastFiredAt) { this.lastFiredAt = lastFiredAt; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
