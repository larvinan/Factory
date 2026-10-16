package com.factoryguard.service;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AuthService {
    // 自动规则服务
    private final Map<String, String> tokenStore = new ConcurrentHashMap<>();
    private final Map<String, String> openidToToken = new ConcurrentHashMap<>();

    public String generateToken(String openid) {
        String token = java.util.UUID.randomUUID().toString().replace("-", "");
        tokenStore.put(token, openid);
        openidToToken.put(openid, token);
        return token;
    }

    public String resolveOpenid(String token) {
        if (token == null || token.isEmpty()) {
            return null;
        }
        return tokenStore.get(token);
    }

    public String resolveToken(String openid) {
        return openidToToken.get(openid);
    }

    public String resolveOpenidFromAuthHeader(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        String token = authHeader.substring(7);
        return resolveOpenid(token);
    }

    public void invalidateToken(String token) {
        String openid = tokenStore.remove(token);
        if (openid != null) {
            openidToToken.remove(openid);
        }
    }
}
