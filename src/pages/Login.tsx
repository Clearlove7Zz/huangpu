import { useState } from 'react';
import { Button, Card, Form, Input, Select, Typography, message } from 'antd';
import { LockOutlined, MobileOutlined, UserOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROLE_OPTIONS, TEST_ACCOUNT, useAuth } from '../auth';

const { Title, Text } = Typography;

export default function Login() {
  const { login, loginWithGateway } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState<string>('指挥部-商务部');
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname || '/dashboard';

  // 登录次序：网关鉴权（huangpu-gateway，签发令牌 + 角色权限）→ 网关不可用时回退
  // 前端演示模式（mock 登录，无服务端校验）。网关明确拒绝（密码错等）则提示并留在本页。
  const handleSubmit = async (values: { username?: string; password?: string }) => {
    const username = (values.username ?? '').trim();
    const password = values.password ?? '';
    setSubmitting(true);
    try {
      if (username && password) {
        const result = await loginWithGateway(username, password);
        if (result.ok) {
          navigate(from, { replace: true });
          return;
        }
        if (!result.offline) {
          message.error(result.error ?? '用户名或密码错误');
          return;
        }
        console.warn('[login] 网关不可达，回退前端演示模式（无服务端鉴权）');
      }
      const isTestAccount = username === TEST_ACCOUNT.username && password === TEST_ACCOUNT.password;
      login(isTestAccount ? TEST_ACCOUNT.role : role);
      navigate(from, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fafafa',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -120,
          right: -80,
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'rgba(244, 162, 97, 0.06)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -140,
          left: -100,
          width: 460,
          height: 460,
          borderRadius: '50%',
          background: 'rgba(19,168,168,0.06)',
        }}
      />

      <Card
        style={{
          width: 400,
          borderRadius: 16,
          border: '1px solid #e5e7eb',
          boxShadow: '0 2px 8px rgba(31, 35, 40, 0.05)',
          position: 'relative',
        }}
        styles={{ body: { padding: 40 } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#f4a261',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            城
          </div>
          <Title level={4} style={{ margin: 0, color: '#1f2328' }}>
            黄埔区城建数字沙盘平台
          </Title>
          <Text type="secondary" style={{ marginTop: 4 }}>
            城市更新项目全生命周期数字化管控
          </Text>
        </div>

        <Form layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="用户名" name="username" initialValue="ai">
            <Input prefix={<UserOutlined style={{ color: 'rgba(31, 35, 40, 0.35)' }} />} placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item label="密码" name="password" initialValue="ai123">
            <Input.Password prefix={<LockOutlined style={{ color: 'rgba(31, 35, 40, 0.35)' }} />} placeholder="请输入密码" />
          </Form.Item>
          <Form.Item label="短信验证码" name="sms" initialValue="888888">
            <Input prefix={<MobileOutlined style={{ color: 'rgba(31, 35, 40, 0.35)' }} />} placeholder="请输入验证码" />
          </Form.Item>
          <Form.Item label="登录角色" required>
            <Select value={role} onChange={setRole} options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
              登 录
            </Button>
          </Form.Item>
        </Form>
        <Text type="secondary" style={{ display: 'block', marginTop: 14, fontSize: 12, textAlign: 'center' }}>
          演示账号：ai/ai123（商务部）· xiong/xiong123（安全员，无利润权限）
        </Text>
      </Card>
    </div>
  );
}

