package com.factoryguard.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryguard.model.Feedback;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface FeedbackMapper extends BaseMapper<Feedback> {
}
