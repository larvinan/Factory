package com.factoryguard.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryguard.model.CommandLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CommandLogMapper extends BaseMapper<CommandLog> {
}
