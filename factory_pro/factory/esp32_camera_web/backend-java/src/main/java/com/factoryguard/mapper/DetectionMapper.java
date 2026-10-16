package com.factoryguard.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryguard.model.Detection;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface DetectionMapper extends BaseMapper<Detection> {

    @Select("SELECT * FROM detections WHERE image_path LIKE CONCAT('%',#{imageId},'%') LIMIT 1")
    Detection findByImageId(String imageId);
}
