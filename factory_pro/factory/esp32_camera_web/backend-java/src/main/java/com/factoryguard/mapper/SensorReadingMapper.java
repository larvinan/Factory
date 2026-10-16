package com.factoryguard.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryguard.model.SensorReading;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SensorReadingMapper extends BaseMapper<SensorReading> {
}
