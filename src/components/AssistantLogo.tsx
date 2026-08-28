/** AI 助手标识：轨道节点，表达检索、连接和回答。 */
export default function AssistantLogo({
  size = 16,
  color = '#ffffff',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3.2" fill={color} />
      <ellipse cx="12" cy="12" rx="9" ry="4.6" transform="rotate(-28 12 12)" stroke={color} strokeWidth="1.5" opacity=".72" />
      <ellipse cx="12" cy="12" rx="9" ry="4.6" transform="rotate(32 12 12)" stroke={color} strokeWidth="1.5" opacity=".42" />
      <circle cx="4.2" cy="7.8" r="1.5" fill={color} />
      <circle cx="19.8" cy="16.2" r="1.5" fill={color} />
    </svg>
  );
}
