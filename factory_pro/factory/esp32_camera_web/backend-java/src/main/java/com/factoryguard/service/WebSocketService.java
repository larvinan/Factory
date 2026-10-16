package com.factoryguard.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class WebSocketService extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(WebSocketService.class);

    private final CopyOnWriteArrayList<WebSocketSession> sessions = new CopyOnWriteArrayList<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("WebSocket 新连接 (当前在线: {})", sessions.size());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("WebSocket 断开 (当前在线: {})", sessions.size());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        if ("ping".equals(message.getPayload())) {
            try {
                session.sendMessage(new TextMessage("{\"type\":\"pong\"}"));
            } catch (IOException ignored) {}
        }
    }

    public void broadcast(String type, String dataJson) {
        String payload = String.format("{\"type\":\"%s\",\"data\":%s}", type, dataJson);
        TextMessage msg = new TextMessage(payload);

        for (WebSocketSession session : sessions) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(msg);
                }
            } catch (IOException e) {
                sessions.remove(session);
            }
        }
    }

    public int getOnlineCount() {
        return sessions.size();
    }
}
