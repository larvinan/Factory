package com.factoryguard.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryguard.model.AppConfig;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AppConfigMapper extends BaseMapper<AppConfig> {
}
