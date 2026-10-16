import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.concurrent.ThreadLocalRandom;

/**
 * RK3568 网关模拟器 —— 按《MQTT数据格式.md》v1.0 模拟硬件行为
 *
 * 用法: java -cp <paho.jar>:. Rk3568Simulator [normal|gas|smoke]
 *   normal  正常环境数据（默认）
 *   gas     注入 MQ5 超标数据（触发 gas_leak 告警联动）
 *   smoke   注入 MQ2 超标数据（触发 fire_smoke 告警）
 *
 * 行为：
 *  - 连接 tcp://localhost:1883（可用环境变量 BROKER 覆盖）
 *  - 每 2 秒发布 factory/sensor/data（QoS 0，扁平 JSON）
 *  - 订阅 factory/device/cmd，打印收到的 {method, params}（模拟下发 STM32）
 *  - 收到 relay/rgb/beep 命令后，下一帧按命令值回读状态（模拟真实反馈）
 */
public class Rk3568Simulator {

    static volatile int relayVal = 0;      // light_on 回读
    static volatile int rgbVal = 2;        // 默认绿色
    static volatile int beepVal = 0;
    static int count = 0;
    static int stock = 0;

    public static void main(String[] args) throws Exception {
        // 用法: java Rk3568Simulator [normal|gas|smoke] [上报间隔秒] [运行时长秒]
        // 默认: normal 2 秒一帧、无限运行（与真实硬件一致）
        // 示例: java Rk3568Simulator normal 5 60  → 每 5 秒一条，运行 1 分钟后自动退出
        String mode = args.length > 0 ? args[0] : "normal";
        int intervalSec = args.length > 1 ? parseIntSafe(args[1], 2) : 2;
        int durationSec = args.length > 2 ? parseIntSafe(args[2], 0) : 0;
        if (intervalSec <= 0) intervalSec = 2;
        String broker = System.getenv().getOrDefault("BROKER", "tcp://localhost:1883");

        MqttClient client = new MqttClient(broker, "rk3568_factory_001", new MemoryPersistence());
        MqttConnectOptions opts = new MqttConnectOptions();
        opts.setCleanSession(true);
        opts.setKeepAliveInterval(60);
        client.connect(opts);

        client.setCallback(new MqttCallback() {
            @Override public void connectionLost(Throwable cause) {
                System.err.println("[cmd] 连接断开: " + cause.getMessage());
            }
            @Override public void messageArrived(String topic, MqttMessage message) {
                String payload = new String(message.getPayload(), StandardCharsets.UTF_8);
                System.out.println("[cmd] 收到下行命令: " + payload);
                applyCommand(payload);
            }
            @Override public void deliveryComplete(IMqttDeliveryToken token) {}
        });

        client.subscribe("factory/device/cmd", 0);
        String lifeInfo = durationSec > 0
                ? ("运行 " + durationSec + " 秒后自动退出")
                : "无限运行（Ctrl+C 停止）";
        System.out.println("[sim] RK3568 模拟器已启动 mode=" + mode
                + " 上报间隔=" + intervalSec + "s " + lifeInfo);
        System.out.println("[sim] 订阅 factory/device/cmd，上报 factory/sensor/data");

        long intervalMs = intervalSec * 1000L;
        long deadline = durationSec > 0 ? System.currentTimeMillis() + durationSec * 1000L : Long.MAX_VALUE;
        int sent = 0;
        while (System.currentTimeMillis() < deadline) {
            Thread.sleep(intervalMs);
            sent++;
            // 计数器每隔几帧 +1，模拟货物通过
            if (sent % 5 == 0) { count++; if (count - stock >= 100) stock = count; }

            double temp, humi; int mq5, mq2, mq5lv, mq2lv, ldr, pir;
            ThreadLocalRandom r = ThreadLocalRandom.current();
            switch (mode) {
                case "gas":   temp = 27 + r.nextDouble(2); humi = 45 + r.nextDouble(8);
                              mq5 = 950 + r.nextInt(300); mq2 = 80 + r.nextInt(60); break;
                case "smoke": temp = 27 + r.nextDouble(2); humi = 45 + r.nextDouble(8);
                              mq5 = 400 + r.nextInt(80); mq2 = 350 + r.nextInt(200); break;
                default:      temp = 26 + r.nextDouble(3); humi = 42 + r.nextDouble(10);
                              mq5 = 380 + r.nextInt(60); mq2 = 60 + r.nextInt(40); break;
            }
            mq5lv = Math.min(100, mq5 * 100 / 5000);
            mq2lv = Math.min(100, mq2 * 100 / 5000);
            ldr = 1600 + r.nextInt(600);
            pir = r.nextInt(10) < 4 ? 1 : 0;

            String json = String.format(
                "{\"ts\":%d,\"temp\":%.1f,\"humi\":%.1f,\"mq5_ppm\":%d,\"mq2_ppm\":%d," +
                "\"mq5_level\":%d,\"mq2_level\":%d,\"ldr_adc\":%d,\"pir\":%d," +
                "\"light_on\":%d,\"rgb_color\":%d,\"beep\":%d,\"count\":%d,\"stock\":%d}",
                Instant.now().getEpochSecond(), temp, humi, mq5, mq2,
                mq5lv, mq2lv, ldr, pir, relayVal, rgbVal, beepVal, count, stock);

            client.publish("factory/sensor/data", json.getBytes(StandardCharsets.UTF_8), 0, false);
            System.out.println("[up ] " + json);
        }

        // 限时模式：到达运行时长后优雅退出（数据保留在数据库，不清除）
        System.out.println("[sim] 运行时长已到，共发送 " + sent + " 条数据，模拟器自动退出");
        try {
            client.disconnect();
        } catch (MqttException ignored) {}
    }

    static int parseIntSafe(String s, int def) {
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    /** 模拟 STM32 执行命令并更新状态回读 */
    static void applyCommand(String payload) {
        try {
            String method = payload.replaceAll(".*\"method\"\\s*:\\s*\"([^\"]+)\".*", "$1");
            if (payload.contains("unknown")) return;
            switch (method) {
                case "relay": relayVal = getInt(payload, "val"); break;
                case "rgb":   rgbVal = getInt(payload, "val"); break;
                case "beep": {
                    int on = getInt(payload, "on_ms"), off = getInt(payload, "off_ms");
                    beepVal = (on == 0) ? 0 : 1;
                    break;
                }
                case "stock": stock = getInt(payload, "val"); count = stock; break;
                case "stock_reset": stock = 0; count = 0; break;
                default:
                    System.err.println("[cmd] unknown method: " + method);
                    return;
            }
            System.out.println("[sim] 已执行 -> light_on=" + relayVal + " rgb=" + rgbVal
                    + " beep=" + beepVal + " stock=" + stock);
        } catch (Exception e) {
            System.err.println("[cmd] 解析失败: " + e.getMessage());
        }
    }

    static int getInt(String payload, String key) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\"" + key + "\"\\s*:\\s*(\\d+)").matcher(payload);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }
}
