package com.factoryguard.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryguard.model.Device;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DeviceMapper extends BaseMapper<Device> {
}
