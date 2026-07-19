import React from 'react';
import {
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  IconButton,
  Input,
  Select,
  SimpleGrid,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import { Trash2 } from 'lucide-react';

/**
 * 展示课表编辑器的概览统计卡片。
 * @param {{label: string, value: number|string, onClick: () => void}} props 组件属性
 * @returns {React.ReactElement} 概览卡片
 */
export function SummaryCard({ label, value, onClick }) {
  return (
    <Card as="button" textAlign="left" onClick={onClick}>
      <CardBody>
        <Text fontSize="sm" color="gray.500">{label}</Text>
        <Text fontSize="2xl" fontWeight="semibold">{value}</Text>
      </CardBody>
    </Card>
  );
}

/**
 * 提供课表编辑器各分区的统一卡片结构。
 * @param {{title: string, desc: string, action?: React.ReactNode, children: React.ReactNode}} props 组件属性
 * @returns {React.ReactElement} 编辑器分区卡片
 */
export function EditorCard({ title, desc, action, children }) {
  return (
    <Card>
      <CardBody>
        <Flex justify="space-between" align="flex-start" gap={4} mb={4}>
          <Box>
            <Text fontSize="lg" fontWeight="semibold">{title}</Text>
            <Text fontSize="sm" color="gray.500">{desc}</Text>
          </Box>
          {action}
        </Flex>
        {children}
      </CardBody>
    </Card>
  );
}

/**
 * 渲染带提示文本的删除图标按钮。
 * @param {{label: string, onClick: () => void}} props 组件属性
 * @returns {React.ReactElement} 删除按钮
 */
export function DeleteButton({ label, onClick }) {
  return (
    <Tooltip label={label}>
      <IconButton aria-label={label} icon={<Trash2 size={16} />} colorScheme="red" variant="ghost" onClick={onClick} />
    </Tooltip>
  );
}

/**
 * 渲染类型选择、重命名和删除控件。
 * @param {{selectedType: string, types: string[], onSelect: Function, onRename: Function, onDelete: Function}} props 组件属性
 * @returns {React.ReactElement} 类型编辑器
 */
export function ScheduleTypeEditor({ selectedType, types, onSelect, onRename, onDelete }) {
  return (
    <SimpleGrid columns={[1, 1, 3]} gap={3}>
      <Select value={selectedType} onChange={(event) => onSelect(event.target.value)}>
        <option value="">请选择类型</option>
        {types.map((type) => <option key={type} value={type}>{type}</option>)}
      </Select>
      <Input value={selectedType} onChange={(event) => selectedType && onRename(selectedType, event.target.value)} placeholder="类型名称" />
      <Button colorScheme="red" variant="outline" onClick={() => selectedType && onDelete(selectedType)} isDisabled={!selectedType}>
        删除此类型
      </Button>
    </SimpleGrid>
  );
}
