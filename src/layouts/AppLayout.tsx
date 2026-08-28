import { useMemo, useState } from 'react';
import { Avatar, Button, Dropdown, Input, Layout, Menu, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  BarChartOutlined,
  BellOutlined,
  BuildOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FundProjectionScreenOutlined,
  NotificationOutlined,
  ProfileOutlined,
  QuestionCircleOutlined,
  ReconciliationOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ShoppingOutlined,
  SyncOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import AssistantLogo from '../components/AssistantLogo';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface MenuEntry {
  key: string;
  label: string;
  icon: React.ReactNode;
}

const GROUP_AI: MenuEntry[] = [{
  key: 'ai',
  label: 'AI 智能问答',
  icon: <span className="app-ai-menu-icon"><AssistantLogo size={16} color="currentColor" /></span>,
}];

const GROUP_SANDBOX: MenuEntry[] = [
  { key: 'dashboard', label: '多项目总览', icon: <AppstoreOutlined /> },
  { key: 'project', label: '单项目详情', icon: <BuildOutlined /> },
  { key: 'decision-system', label: '一体化决策推演', icon: <FundProjectionScreenOutlined /> },
];

const GROUP_BUSINESS: MenuEntry[] = [
  { key: 'progress-system', label: '施工进度管控', icon: <BarChartOutlined /> },
  { key: 'design-control', label: '设计管控', icon: <ProfileOutlined /> },
  { key: 'documents', label: '文档管理', icon: <FolderOpenOutlined /> },
  { key: 'work-mgmt', label: '工作管理', icon: <NotificationOutlined /> },
  { key: 'cost-system', label: '成本测算子系统', icon: <DollarOutlined /> },
  { key: 'material', label: '物资消耗管控', icon: <ShoppingOutlined /> },
  { key: 'supplier-system', label: '供应商库', icon: <TeamOutlined /> },
  { key: 'coordination', label: '外协协调', icon: <ReconciliationOutlined /> },
  { key: 'cashflow', label: '动态现金流', icon: <DatabaseOutlined /> },
  { key: 'risk-system', label: '风险管理系统', icon: <WarningOutlined /> },
  { key: 'safety-log', label: '安全日志 AI巡检', icon: <SafetyCertificateOutlined /> },
  { key: 'reports', label: '报表中心', icon: <FileTextOutlined /> },
];

const GROUP_SYSTEM: MenuEntry[] = [{ key: 'sync', label: '数据同步日志', icon: <SyncOutlined /> }];

const ALL_KEYS = new Set([...GROUP_AI, ...GROUP_SANDBOX, ...GROUP_BUSINESS, ...GROUP_SYSTEM].map((m) => m.key));

function buildItems(visible: Set<string>): MenuProps['items'] {
  const pick = (list: MenuEntry[]) => list.filter((m) => visible.has(m.key)).map((m) => ({ key: m.key, icon: m.icon, label: m.label }));
  const groups: MenuProps['items'] = [];
  const ai = pick(GROUP_AI);
  const sandbox = pick(GROUP_SANDBOX);
  const business = pick(GROUP_BUSINESS);
  const system = pick(GROUP_SYSTEM);
  if (ai.length) groups.push({ type: 'group', label: 'AI 助手', children: ai });
  if (sandbox.length) groups.push({ type: 'group', label: '数字沙盘', children: sandbox });
  if (business.length) groups.push({ type: 'group', label: '业务系统', children: business });
  if (system.length) groups.push({ type: 'group', label: '系统', children: system });
  return groups;
}

const TITLES: Record<string, string> = {
  ai: 'AI 智能问答',
  dashboard: '多项目总览',
  project: '单项目详情',
  'decision-system': '一体化决策推演',
  'progress-system': '施工进度管控',
  'design-control': '设计管控',
  documents: '文档管理',
  'work-mgmt': '工作管理',
  'cost-system': '成本测算子系统',
  material: '物资消耗管控',
  'supplier-system': '供应商库',
  coordination: '外协协调',
  cashflow: '动态现金流',
  'risk-system': '风险管理系统',
  'safety-log': '安全日志 AI巡检',
  reports: '报表中心',
  sync: '数据同步日志',
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const currentKey = location.pathname.slice(1) || 'dashboard';
  const visible = useMemo(
    () => (user ? new Set(user.nav.filter((k) => ALL_KEYS.has(k))) : new Set<string>()),
    [user],
  );

  const menuItems = useMemo(() => buildItems(visible), [visible]);

  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', label: '个人资料' },
    { key: 'feedback', label: '意见反馈' },
    { key: 'logout', label: '退出登录', danger: true },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={236}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        theme="light"
        style={{
          borderRight: '1px solid #e5e7eb',
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 100,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 56,
            padding: collapsed ? '0 12px' : '0 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#f4a261',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            城
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2328', lineHeight: '20px', whiteSpace: 'nowrap' }}>
                黄埔区城建数字沙盘
              </div>
              <div style={{ fontSize: 11, color: 'rgba(31, 35, 40, 0.42)', whiteSpace: 'nowrap' }}>
                全生命周期数字化管控
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 8px 0',
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[currentKey]}
            items={menuItems}
            onClick={({ key }) => navigate(`/${key}`)}
            style={{ borderInlineEnd: 'none' }}
          />
        </div>

        <div
          style={{
            flexShrink: 0,
            padding: '8px 12px 12px',
          }}
        >
          <div
            style={{
              borderTop: '1px solid rgba(0,0,0,0.05)',
              marginBottom: 4,
            }}
          />
          <Dropdown
            menu={{
              items: userMenuItems,
              onClick: ({ key }) => {
                if (key === 'logout') logout();
              },
            }}
            trigger={['click']}
            placement="topLeft"
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                minWidth: 0,
                padding: collapsed ? '6px 4px' : '6px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                justifyContent: collapsed ? 'center' : 'flex-start',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Avatar
                size={32}
                style={{
                  background: '#f4a261',
                  flexShrink: 0,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {user?.avatar}
              </Avatar>
              {!collapsed && (
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'rgba(0,0,0,0.85)',
                      lineHeight: '18px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {user?.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'rgba(0,0,0,0.35)',
                      lineHeight: '16px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {user?.role}
                  </div>
                </div>
              )}
            </div>
          </Dropdown>
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            height: 56,
            lineHeight: '56px',
            padding: '0 24px',
            background: '#ffffff',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 99,
          }}
        >
          <Space size={8}>
            <Button
              type="text"
              aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 14, color: 'rgba(31, 35, 40, 0.45)' }}
            />
            <Text style={{ fontSize: 13, color: 'rgba(31, 35, 40, 0.42)' }}>首页 /</Text>
            <Text strong style={{ fontSize: 13, color: '#1f2328' }}>{TITLES[currentKey] || '多项目总览'}</Text>
          </Space>

          <Space size={16}>
            <Input
              allowClear
              variant="filled"
              prefix={<SearchOutlined style={{ color: 'rgba(31, 35, 40, 0.35)' }} />}
              placeholder="搜索项目 / 指标 / 文档"
              style={{ width: 220, background: '#ecf4f0' }}
            />
            <Space size={4}>
              <Button type="text" aria-label="消息通知" icon={<BellOutlined />} />
              <Button type="text" aria-label="帮助文档" icon={<QuestionCircleOutlined />} />
            </Space>
          </Space>
        </Header>

        <Content className={location.pathname === '/ai' ? 'app-content-ai' : undefined} style={{ padding: 24, background: '#fafafa', minHeight: 'calc(100vh - 56px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

