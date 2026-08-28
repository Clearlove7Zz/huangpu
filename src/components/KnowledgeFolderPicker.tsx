import { FolderOpenOutlined } from '@ant-design/icons';
import { Button, Checkbox, Divider, Empty, Popover, Space, Typography } from 'antd';

const { Text } = Typography;

export interface PickerFolder { id: string; name: string }

export default function KnowledgeFolderPicker({
  folders,
  selectedIds,
  onChange,
  disabled,
}: {
  folders: PickerFolder[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const allSelected = folders.length > 0 && selectedIds.length === folders.length;
  const label = folders.length === 0 ? '加载文件夹' : selectedIds.length === 0 ? '未选择文件夹' : allSelected ? `文件夹 ${folders.length}` : `已选 ${selectedIds.length} 个文件夹`;
  const menu = (
    <div className="folder-picker-menu">
      <div className="folder-picker-head">
        <Text strong>选择检索文件夹</Text>
        <Button type="link" size="small" onClick={() => onChange(allSelected ? [] : folders.map((folder) => folder.id))}>
          {allSelected ? '清空' : '全选'}
        </Button>
      </div>
      <Divider style={{ margin: '4px 0 8px' }} />
      {folders.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用文件夹" /> : folders.map((folder) => (
        <Checkbox
          key={folder.id}
          checked={selectedIds.includes(folder.id)}
          onChange={(event) => onChange(event.target.checked ? [...selectedIds, folder.id] : selectedIds.filter((id) => id !== folder.id))}
        >
          {folder.name}
        </Checkbox>
      ))}
    </div>
  );
  return (
    <Popover content={menu} trigger="click" placement="topLeft" arrow={false}>
      <Button type="text" className="workbench-pill" disabled={disabled}>
        <Space size={6}><FolderOpenOutlined />{label}</Space>
      </Button>
    </Popover>
  );
}
