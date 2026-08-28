# 黄埔城更 · 安全日志 AI巡检服务

基于开源 **YOLOv8m PPE** 模型（[Hexmon/vyra-yolo-ppe-detection](https://huggingface.co/Hexmon/vyra-yolo-ppe-detection)）识别施工现场安全隐患（未戴安全帽、未穿反光背心、疑似坠落等）。

## 启动

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python download_model.py    # 首次下载 best.pt（约 50MB）
uvicorn app:app --host 127.0.0.1 --port 8765
```

健康检查：http://127.0.0.1:8765/api/health

## 线上也能测（Cloudflare 隧道）

本机 YOLO 通过临时公网 HTTPS 暴露，线上站点即可调用：

```bash
# 需已安装依赖、下载模型，且本机可跑 uvicorn
./start-online.sh --deploy
```

脚本会：启动/检测本地 API → 开 Cloudflare Tunnel → 写入 `js/safety-ai-config.js` → 发布 OSS。

然后打开 http://huangpu-szsp.xyz/index.html ，进入「安全日志 AI巡检」。

注意：
- **保持 `start-online.sh` 终端不要关**（关了公网就断）
- 临时隧道地址每次重启会变，需再跑一次 `--deploy`
- 电脑休眠/断网会导致线上识别失败

前端默认 API：本地 `127.0.0.1:8765`，线上见 `js/safety-ai-config.js`。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 模型是否已加载 |
| POST | `/api/inspect` | multipart：`file` + `project`/`area`/`inspector`/`check_date` |
| GET | `/api/records` | 巡检历史 |
| GET | `/api/records/{id}` | 单条详情 |
| PATCH | `/api/records/{id}` | 更新整改人/复查情况/`written_to_log` |
| GET | `/api/images/annotated/{id}` | 标注图 |
| GET | `/api/images/original/{id}` | 原图 |

## 隐患类别映射

| YOLO class | 日志文案 | 级别 |
|------------|----------|------|
| NO-Hardhat | 未佩戴安全帽 | 一般隐患 |
| NO-Safety Vest | 未穿反光背心 | 一般隐患 |
| NO-Mask / NO-Gloves / NO-Goggles | 防护用品缺失 | 一般隐患 |
| Fall-Detected | 疑似高处坠落风险 | 重大关注 |

## 许可说明

- Ultralytics YOLO：AGPL-3.0
- 训练数据集标注：CC BY 4.0（见模型卡）
