import React, { useRef, useState } from 'react';
import { Alert, AlertIcon, Box, Button, Card, CardBody, Flex, Heading, Progress, Text } from '@chakra-ui/react';
import { Gauge, Play } from 'lucide-react';

const TEST_DURATION_MS = 1200;

/** 根据 renderer 测得的帧率和长帧比例选择设备性能档位。 */
function recommendProfile(fps, longFrameRatio) {
  if (fps >= 55 && longFrameRatio < 0.08) {
    return { tier: 'fast', transitionFrameIntervalMs: 16, blurSigmaMultiplier: 1 };
  }
  if (fps >= 35 && longFrameRatio < 0.2) {
    return { tier: 'balanced', transitionFrameIntervalMs: 33, blurSigmaMultiplier: 0.75 };
  }
  return { tier: 'slow', transitionFrameIntervalMs: 50, blurSigmaMultiplier: 0.5 };
}

/** 将用户当前模糊度按设备档位降低，保留颜色和透明度设置。 */
function tuneGlassStyle(style, profile) {
  if (!style || !profile) return null;
  return {
    ...style,
    blurSigma: Math.round(style.blurSigma * profile.blurSigmaMultiplier * 10) / 10
  };
}

/** 展示性能测试、设备档位和自动应用结果。 */
export default function PerformanceView({ ipcRenderer }) {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const frameTimes = useRef([]);
  const testStartedAt = useRef(0);

  /** 执行一轮短帧率测试，并把结果提交给主进程。 */
  function runTest() {
    if (status === 'running') return;
    setStatus('running');
    setResult(null);
    setError('');
    frameTimes.current = [];
    testStartedAt.current = performance.now();

    const sample = lastTimestamp => {
      const timestamp = performance.now();
      if (lastTimestamp !== null) frameTimes.current.push(timestamp - lastTimestamp);
      if (timestamp - testStartedAt.current < TEST_DURATION_MS) {
        requestAnimationFrame(() => sample(timestamp));
        return;
      }

      const times = frameTimes.current;
      const elapsed = Math.max(1, timestamp - testStartedAt.current);
      const fps = Math.round(times.length * 1000 / elapsed);
      const longFrameRatio = times.length ? times.filter(time => time > 32).length / times.length : 1;
      const profile = recommendProfile(fps, longFrameRatio);
      applyProfile({ fps, longFrameRatio, profile });
    };

    requestAnimationFrame(() => sample(null));
  }

  /** 保存性能档位，并按结果自动降低高负载设备的玻璃模糊度。 */
  async function applyProfile(measurement) {
    try {
      const styleResult = await ipcRenderer.invoke('get-mini-countdown-glass-style');
      const currentStyle = styleResult?.success ? styleResult.style : null;
      const tunedStyle = tuneGlassStyle(currentStyle, measurement.profile);
      const performanceResult = await ipcRenderer.invoke('set-glass-performance', measurement.profile);
      if (!performanceResult?.success) throw new Error(performanceResult?.error || '设备性能配置保存失败');
      if (tunedStyle && tunedStyle.blurSigma !== currentStyle.blurSigma) {
        const styleUpdate = await ipcRenderer.invoke('set-mini-countdown-glass-style', tunedStyle);
        if (!styleUpdate?.success) throw new Error(styleUpdate?.error || '玻璃参数应用失败');
      }
      setResult({ ...measurement, blurSigma: tunedStyle?.blurSigma ?? currentStyle?.blurSigma });
      setStatus('done');
    } catch (cause) {
      setError(cause?.message || String(cause));
      setStatus('error');
    }
  }

  const tierLabel = { fast: '高性能', balanced: '均衡', slow: '节能稳定' };

  return (
    <Box>
      <Heading as="h2" size="md" mb={2}>设备性能测试</Heading>
      <Text color="gray.500" mb={5}>测试当前设备的动画帧率，并自动调整液态玻璃切换频率和模糊度。</Text>
      <Card>
        <CardBody>
          <Flex align="center" gap={3} mb={4}>
            <Gauge size={20} />
            <Box>
              <Text fontWeight="semibold">液态玻璃性能档位</Text>
              <Text fontSize="sm" color="gray.500">测试期间请保持窗口可见。</Text>
            </Box>
          </Flex>
          <Box className="glass-performance-stage" aria-hidden="true">
            <Box className="glass-performance-sample" />
            <Box className="glass-performance-sample glass-performance-sample-secondary" />
          </Box>
          <Progress value={status === 'running' ? undefined : 0} isIndeterminate={status === 'running'} mb={4} />
          <Button leftIcon={<Play size={16} />} onClick={runTest} isLoading={status === 'running'} loadingText="测试中">
            开始测试并自动应用
          </Button>
          {status === 'running' && <Text role="status" mt={3} fontSize="sm" color="gray.500">正在采样动画帧率...</Text>}
          {status === 'done' && result && (
            <Box mt={4} role="status">
              <Text>性能档位：{tierLabel[result.profile.tier]}</Text>
              <Text fontSize="sm" color="gray.500">
                平均帧率 {result.fps} FPS，长帧比例 {Math.round(result.longFrameRatio * 100)}%，模糊度已调整为 {result.blurSigma ?? '-'}。
              </Text>
            </Box>
          )}
          {status === 'error' && <Alert status="error" mt={4}><AlertIcon />{error}</Alert>}
        </CardBody>
      </Card>
    </Box>
  );
}
