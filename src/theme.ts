import type { ThemeConfig } from 'antd';

/**
 * Codex 风格浅色主题（2026-08-14 定稿）
 * 底色：近白（#FAFAFA 画布 / #FFFFFF 容器）· 文字：深灰（#1F2328）
 * 主强调：橙 #E07B39（Variable Orange，按钮用深橙保证白字对比度）
 * 辅助强调：青绿 #2EC4B6（Result Teal）· 琥珀 #D4A300（Syntax Yellow 深色化）· 珊瑚 #E5484D（Compile Coral）· 靛蓝 #3D348B
 */
export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#e07b39',
    colorInfo: '#2ec4b6',
    colorSuccess: '#2ec4b6',
    colorWarning: '#d4a300',
    colorError: '#e5484d',
    colorText: '#1f2328',
    colorTextSecondary: 'rgba(31, 35, 40, 0.66)',
    colorTextTertiary: 'rgba(31, 35, 40, 0.45)',
    colorBgLayout: '#fafafa',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBorder: '#e5e7eb',
    colorBorderSecondary: '#ececf0',
    colorPrimaryBg: 'rgba(224, 123, 57, 0.1)',
    borderRadius: 12,
    borderRadiusLG: 12,
    borderRadiusSM: 8,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
  components: {
    Layout: {
      siderBg: '#f7f7f8',
      headerBg: '#ffffff',
      bodyBg: '#fafafa',
    },
    Menu: {
      itemBg: 'transparent',
      itemColor: 'rgba(31, 35, 40, 0.66)',
      itemHoverBg: 'rgba(224, 123, 57, 0.08)',
      itemHoverColor: '#e07b39',
      itemSelectedBg: 'rgba(224, 123, 57, 0.12)',
      itemSelectedColor: '#e07b39',
      groupTitleColor: 'rgba(31, 35, 40, 0.45)',
    },
    Card: {
      headerBg: 'transparent',
    },
    Table: {
      headerBg: '#fafafa',
      headerColor: 'rgba(31, 35, 40, 0.66)',
      rowHoverBg: 'rgba(224, 123, 57, 0.05)',
      borderColor: '#e5e7eb',
    },
    Statistic: {
      contentFontSize: 28,
    },
    Button: {
      primaryShadow: 'none',
    },
  },
};
