import React from 'react';
import {
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  Select,
  SimpleGrid,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import { ChevronDown, Trash2 } from 'lucide-react';

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

/**
 * 渲染最多可按选择顺序选中两门课程的受控菜单。
 * @param {{value: string|string[], options: Array<{key: string, label: string}>, onChange: (value: string|string[]) => void}} props 组件属性
 * @returns {React.ReactElement} 科目多选菜单
 */
export function SubjectMultiSelect({ value, options, onChange }) {
  const optionKeys = new Set(options.map((option) => option.key));
  const optionLabels = new Map(options.map((option) => [option.key, option.label]));
  const currentValues = Array.isArray(value) ? value : value ? [value] : [];
  const selectedValues = currentValues.filter((item) => optionKeys.has(item)).slice(0, 2);

  /**
   * 将 Chakra 复选菜单值转换为课表配置使用的课程格式。
   * @param {string[]} nextValues Chakra 复选菜单值
   * @returns {void}
   */
  const handleChange = (nextValues) => {
    if (nextValues.length > 2) return;
    if (nextValues.length === 0) {
      onChange('');
      return;
    }
    onChange(nextValues.length === 1 ? nextValues[0] : nextValues);
  };

  /**
   * 切换一个科目的选中状态并保持点击顺序。
   * @param {string} subjectKey 科目简称
   * @returns {void}
   */
  const toggleSubject = (subjectKey) => {
    const nextValues = selectedValues.includes(subjectKey)
      ? selectedValues.filter((item) => item !== subjectKey)
      : [...selectedValues, subjectKey];
    handleChange(nextValues);
  };

  const displayValues = selectedValues.map((key) => optionLabels.get(key) || key);
  const buttonLabel = options.length === 0
    ? '暂无可选科目'
    : displayValues.length === 0
      ? '请选择课程'
      : displayValues.length === 1
        ? displayValues[0]
        : `单周：${displayValues[0]} / 双周：${displayValues[1]}`;

  return (
    <Menu closeOnSelect={false} isLazy lazyBehavior="unmount">
      <MenuButton
        as={Button}
        flex={1}
        minW={0}
        variant="outline"
        rightIcon={<ChevronDown size={16} />}
        textAlign="left"
        isDisabled={options.length === 0}
      >
        <Text as="span" noOfLines={1}>{buttonLabel}</Text>
      </MenuButton>
      <MenuList w={{ base: 'calc(100vw - 32px)', md: '480px' }} maxW="calc(100vw - 32px)">
        <SimpleGrid minChildWidth="96px" gap={2} p={2}>
          {options.map((option) => (
            <MenuItemOption
              key={option.key}
              type="checkbox"
              value={option.key}
              isChecked={selectedValues.includes(option.key)}
              isDisabled={selectedValues.length >= 2 && !selectedValues.includes(option.key)}
              minH="48px"
              w="100%"
              minW={0}
              border="1px solid"
              borderColor="gray.200"
              borderRadius="md"
              px={3}
              py={2}
              whiteSpace="nowrap"
              onClick={() => toggleSubject(option.key)}
            >
              <Text as="span" fontSize="sm" lineHeight="short" textAlign="left">{option.label}</Text>
            </MenuItemOption>
          ))}
        </SimpleGrid>
      </MenuList>
    </Menu>
  );
}
