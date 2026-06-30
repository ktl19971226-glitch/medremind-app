import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import {
  Archive,
  Bell,
  CalendarClock,
  CarFront,
  CheckCircle2,
  ChevronRight,
  CloudRain,
  Database,
  Edit3,
  Eye,
  Home,
  Inbox,
  MapPin,
  RefreshCcw,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Trash2,
  UserRound
} from 'lucide-react-native';

const API_BASE = Constants.expoConfig?.extra?.apiBase || process.env.EXPO_PUBLIC_API_BASE || 'https://local-alert.yaojidecare.app';
const DEVICE_ID_KEY = 'local-alert-device-id';
const DEVICE_SECRET_KEY = 'local-alert-device-secret';
const ADMIN_TOKEN = Constants.expoConfig?.extra?.adminToken || process.env.EXPO_PUBLIC_ADMIN_TOKEN || '';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

const categoryIcons = {
  environment: CloudRain,
  mobility: CarFront,
  civic: Home,
  safety: ShieldAlert,
  personal: CalendarClock
};

const categoryColors = {
  environment: '#2563eb',
  mobility: '#0891b2',
  civic: '#7c3aed',
  safety: '#dc2626',
  personal: '#16a34a'
};

const moduleLabels = {
  rain: '降雨提醒',
  temperature: '溫度提醒',
  'air-quality': '空氣品質',
  earthquake: '地震提醒',
  typhoon: '颱風警戒',
  commute: '通勤路況',
  transit: '大眾運輸',
  'road-incident': '道路事故',
  roadwork: '道路施工',
  parking: '停車提醒',
  'garbage-truck': '垃圾車',
  'water-outage': '停水提醒',
  'power-outage': '停電提醒',
  'gas-work': '瓦斯施工',
  'local-bulletin': '市政公告',
  fire: '火災警示',
  accident: '事故警示',
  'crime-watch': '治安提醒',
  'fraud-alert': '詐騙提醒',
  evacuation: '避難資訊',
  bill: '帳單提醒',
  package: '包裹提醒',
  calendar: '行事曆',
  medicine: '藥物提醒',
  chores: '家務提醒'
};

const dataStatusLabels = {
  live: '真實資料',
  'no-event': '無即時事件',
  'not-configured': '未設定資料源'
};

function makeDeviceId() {
  return `ios-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function saveDeviceSecret(secret) {
  if (!secret) return;
  await SecureStore.setItemAsync(DEVICE_SECRET_KEY, secret);
}

async function loadDeviceAuth() {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    const secret = await SecureStore.getItemAsync(DEVICE_SECRET_KEY);
    if (existing) return { deviceId: existing, deviceSecret: secret || '' };
    const next = makeDeviceId();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, next);
    return { deviceId: next, deviceSecret: '' };
  } catch {
    return { deviceId: makeDeviceId(), deviceSecret: '' };
  }
}

async function api(path, auth, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': auth.deviceId,
      ...(auth.deviceSecret ? { 'X-Device-Secret': auth.deviceSecret } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '在地提醒',
      importance: Notifications.AndroidImportance.MAX
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data;
}

export default function App() {
  const [deviceId, setDeviceId] = useState(null);
  const [deviceSecret, setDeviceSecret] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [state, setState] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('environment');
  const [locationDraft, setLocationDraft] = useState({ label: '主要地點', city: '台北市', district: '信義區' });
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [pushStatus, setPushStatus] = useState('尚未註冊');
  const [loading, setLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);

  const selected = useMemo(() => catalog.find(item => item.id === selectedCategory), [catalog, selectedCategory]);
  const rules = useMemo(() => state?.rules?.filter(rule => rule.categoryId === selectedCategory) || [], [state, selectedCategory]);
  const unreadCount = state?.unreadCount || 0;
  const onboardingDone = Boolean(state?.user?.onboardingCompleted);
  const auth = useMemo(() => ({ deviceId, deviceSecret }), [deviceId, deviceSecret]);

  async function rememberDeviceSecret(secret) {
    if (!secret) return;
    setDeviceSecret(secret);
    await saveDeviceSecret(secret);
  }

  async function refresh(nextAuth = auth) {
    if (!nextAuth.deviceId) return;
    const [catalogData, stateData] = await Promise.all([
      api('/api/catalog', nextAuth),
      api('/api/state', nextAuth)
    ]);
    if (stateData.deviceSecret) await rememberDeviceSecret(stateData.deviceSecret);
    setCatalog(catalogData.categories);
    setState(stateData);
    if (ADMIN_TOKEN) {
      try {
        const adminData = await api('/api/admin/summary', nextAuth, { headers: { 'X-Admin-Token': ADMIN_TOKEN } });
        setAdmin(adminData);
      } catch {
        setAdmin(null);
      }
    }
    const firstLocation = stateData.locations?.[0];
    if (firstLocation) {
      setLocationDraft({
        label: firstLocation.label || '主要地點',
        city: firstLocation.city || '台北市',
        district: firstLocation.district || '信義區'
      });
    }
  }

  useEffect(() => {
    loadDeviceAuth()
      .then(nextAuth => {
        setDeviceId(nextAuth.deviceId);
        setDeviceSecret(nextAuth.deviceSecret);
        return refresh(nextAuth);
      })
      .catch(error => Alert.alert('載入失敗', error.message));
  }, []);

  async function completeOnboarding() {
    setLoading(true);
    try {
      const result = await api('/api/bootstrap', auth, {
        method: 'POST',
        body: JSON.stringify(locationDraft)
      });
      await rememberDeviceSecret(result.deviceSecret);
      setState(result.state);
      await enablePush(false, { deviceId, deviceSecret: result.deviceSecret });
      Alert.alert('設定完成', '已建立你的個人提醒設定。');
    } catch (error) {
      Alert.alert('設定失敗', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRule(rule) {
    try {
      const result = await api(`/api/rules/${encodeURIComponent(rule.id)}`, auth, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled })
      });
      setState(current => ({ ...current, rules: result.rules }));
    } catch (error) {
      Alert.alert('規則更新失敗', error.message);
    }
  }

  async function cycleSeverity(rule) {
    try {
      const nextSeverity = rule.severity === 'critical' ? 'normal' : 'critical';
      const result = await api(`/api/rules/${encodeURIComponent(rule.id)}`, auth, {
        method: 'PATCH',
        body: JSON.stringify({ severity: nextSeverity })
      });
      setState(current => ({ ...current, rules: result.rules }));
    } catch (error) {
      Alert.alert('警示等級更新失敗', error.message);
    }
  }

  async function saveLocation() {
    try {
      const path = editingLocationId ? `/api/locations/${encodeURIComponent(editingLocationId)}` : '/api/locations';
      const result = await api(path, auth, {
        method: editingLocationId ? 'PATCH' : 'POST',
        body: JSON.stringify(locationDraft)
      });
      setState(current => ({ ...current, locations: result.locations }));
      setEditingLocationId(null);
      Alert.alert(editingLocationId ? '已更新地點' : '已新增地點', `${locationDraft.city}${locationDraft.district}`);
    } catch (error) {
      Alert.alert('地點儲存失敗', error.message);
    }
  }

  async function deleteLocation(location) {
    try {
      const result = await api(`/api/locations/${encodeURIComponent(location.id)}`, auth, { method: 'DELETE' });
      setState(current => ({ ...current, locations: result.locations }));
    } catch (error) {
      Alert.alert('地點刪除失敗', error.message);
    }
  }

  async function useCurrentLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('定位未授權', '請允許定位後再試一次。');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync(current.coords);
      const place = places[0] || {};
      setLocationDraft(draft => ({
        ...draft,
        label: draft.label || '目前位置',
        city: place.city || place.region || draft.city,
        district: place.district || place.subregion || draft.district,
        lat: current.coords.latitude,
        lng: current.coords.longitude
      }));
    } catch (error) {
      Alert.alert('定位失敗', error.message);
    }
  }

  async function enablePush(showAlert = true, nextAuth = auth) {
    try {
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        setPushStatus('未取得權限');
        if (showAlert) Alert.alert('推播未啟用', '請在手機上授權通知。');
        return;
      }
      await api('/api/devices/register', nextAuth, {
        method: 'POST',
        body: JSON.stringify({ pushToken: token, platform: Platform.OS })
      });
      setPushStatus('已註冊手機推播');
      if (showAlert) Alert.alert('推播已啟用', '之後會依你的規則接收在地提醒。');
    } catch (error) {
      Alert.alert('推播註冊失敗', error.message);
    }
  }

  async function runCheck() {
    setLoading(true);
    try {
      const result = await api('/api/check-now', auth, { method: 'POST', body: JSON.stringify({}) });
      setState(result.state);
      await refresh();
      Alert.alert('檢查完成', `產生 ${result.generated} 則提醒，推播 ${result.pushed} 台裝置。`);
    } catch (error) {
      Alert.alert('檢查失敗', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendTestPush() {
    try {
      const result = await api('/api/test-push', auth, { method: 'POST', body: JSON.stringify({}) });
      Alert.alert('測試推播', `已送出 ${result.pushed} 則。`);
    } catch (error) {
      Alert.alert('測試推播失敗', error.message);
    }
  }

  async function updateAlert(alert, patch) {
    try {
      const result = await api(`/api/alerts/${encodeURIComponent(alert.id)}`, auth, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      setState(current => ({
        ...current,
        alerts: result.alerts,
        unreadCount: result.alerts.filter(item => !item.read && !item.archived).length
      }));
      setSelectedAlert(current => current?.id === alert.id ? { ...current, ...patch } : current);
    } catch (error) {
      Alert.alert('提醒更新失敗', error.message);
    }
  }

  async function markAllRead() {
    try {
      const result = await api('/api/alerts/read-all', auth, { method: 'POST', body: JSON.stringify({}) });
      setState(current => ({ ...current, alerts: result.alerts, unreadCount: 0 }));
    } catch (error) {
      Alert.alert('全部已讀失敗', error.message);
    }
  }

  if (!state) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.loadingShell}>
          <Text style={styles.title}>在地雷達</Text>
          <Text style={styles.muted}>正在同步提醒設定...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!onboardingDone) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>FIRST RUN</Text>
              <Text style={styles.title}>設定在地雷達</Text>
            </View>
            <UserRound size={28} color="#2563eb" />
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>主要監控地點</Text>
            <TextInput style={styles.inputFull} value={locationDraft.label} onChangeText={label => setLocationDraft(current => ({ ...current, label }))} placeholder="地點名稱" />
            <View style={styles.inputRow}>
              <TextInput style={styles.input} value={locationDraft.city} onChangeText={city => setLocationDraft(current => ({ ...current, city }))} placeholder="城市" />
              <TextInput style={styles.input} value={locationDraft.district} onChangeText={district => setLocationDraft(current => ({ ...current, district }))} placeholder="行政區" />
            </View>
            <Pressable style={styles.secondaryButton} onPress={useCurrentLocation}>
              <MapPin size={16} color="#0f172a" />
              <Text style={styles.secondaryButtonText}>使用目前位置</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={completeOnboarding} disabled={loading}>
              <Text style={styles.primaryButtonText}>{loading ? '建立中' : '完成設定並啟用推播'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>LOCAL ALERT</Text>
            <Text style={styles.title}>在地雷達</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={() => refresh()}>
            <RefreshCcw size={18} color="#0f172a" />
          </Pressable>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{state.locations.length}</Text>
            <Text style={styles.metricLabel}>地點</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{unreadCount}</Text>
            <Text style={styles.metricLabel}>未讀</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{state.rules.filter(rule => rule.enabled).length}</Text>
            <Text style={styles.metricLabel}>啟用規則</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.rowBetween}>
            <View style={styles.rowStart}>
              <MapPin size={18} color="#2563eb" />
              <Text style={styles.panelTitle}>監控地點</Text>
            </View>
            <Text style={styles.muted}>{editingLocationId ? '編輯中' : `${state.locations.length} 個`}</Text>
          </View>
          <TextInput style={styles.inputFull} value={locationDraft.label} onChangeText={label => setLocationDraft(current => ({ ...current, label }))} placeholder="地點名稱" />
          <View style={styles.inputRow}>
            <TextInput style={styles.input} value={locationDraft.city} onChangeText={city => setLocationDraft(current => ({ ...current, city }))} placeholder="城市" />
            <TextInput style={styles.input} value={locationDraft.district} onChangeText={district => setLocationDraft(current => ({ ...current, district }))} placeholder="行政區" />
          </View>
          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={useCurrentLocation}>
              <MapPin size={16} color="#0f172a" />
              <Text style={styles.secondaryButtonText}>定位</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={saveLocation}>
              <Text style={styles.primaryButtonText}>{editingLocationId ? '儲存' : '新增地點'}</Text>
            </Pressable>
          </View>
          {state.locations.map(location => (
            <View key={location.id} style={styles.locationItem}>
              <View>
                <Text style={styles.locationTitle}>{location.label}</Text>
                <Text style={styles.muted}>{location.city}{location.district}</Text>
              </View>
              <View style={styles.rowStart}>
                <Pressable style={styles.iconMini} onPress={() => {
                  setEditingLocationId(location.id);
                  setLocationDraft({
                    label: location.label,
                    city: location.city,
                    district: location.district
                  });
                }}>
                  <Edit3 size={15} color="#0f172a" />
                </Pressable>
                <Pressable style={styles.iconMini} onPress={() => deleteLocation(location)}>
                  <Trash2 size={15} color="#dc2626" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <View style={styles.rowStart}>
            <Bell size={18} color="#7c3aed" />
            <Text style={styles.panelTitle}>手機 App 推播</Text>
          </View>
          <Text style={styles.muted}>{pushStatus} · 安靜時段 23:00-08:00，重大警示不靜音</Text>
          <View style={styles.buttonRow}>
            <Pressable style={styles.primaryButton} onPress={() => enablePush()}>
              <Text style={styles.primaryButtonText}>啟用推播</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={sendTestPush}>
              <Text style={styles.secondaryButtonText}>測試</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {catalog.map(category => {
            const Icon = categoryIcons[category.id] || SlidersHorizontal;
            const selectedTab = category.id === selectedCategory;
            return (
              <Pressable key={category.id} style={[styles.tab, selectedTab && styles.tabSelected]} onPress={() => setSelectedCategory(category.id)}>
                <Icon size={18} color={selectedTab ? '#ffffff' : categoryColors[category.id]} />
                <Text style={[styles.tabText, selectedTab && styles.tabTextSelected]}>{category.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>{selected?.name || '提醒模組'}</Text>
            <Text style={styles.sectionSub}>{selected?.description}</Text>
          </View>
          <Pressable style={styles.checkButton} onPress={runCheck} disabled={loading}>
            <Siren size={16} color="#ffffff" />
            <Text style={styles.checkButtonText}>{loading ? '檢查中' : '立即檢查'}</Text>
          </Pressable>
        </View>

        <View style={styles.ruleList}>
          {rules.map(rule => (
            <View key={rule.id} style={styles.ruleItem}>
              <View style={styles.ruleMain}>
                <Text style={styles.ruleTitle}>{moduleLabels[rule.moduleId] || rule.moduleId}</Text>
                <Text style={styles.ruleMeta}>{rule.severity === 'critical' ? '重大警示' : '一般提醒'} · 安靜時段 {rule.quietHours.start}-{rule.quietHours.end}</Text>
              </View>
              <Pressable style={[styles.severityPill, rule.severity === 'critical' && styles.severityCritical]} onPress={() => cycleSeverity(rule)}>
                <Text style={[styles.severityText, rule.severity === 'critical' && styles.severityTextCritical]}>{rule.severity === 'critical' ? '重大' : '一般'}</Text>
              </Pressable>
              <Switch value={rule.enabled} onValueChange={() => toggleRule(rule)} />
            </View>
          ))}
        </View>

        <View style={styles.panel}>
          <View style={styles.rowBetween}>
            <View style={styles.rowStart}>
              <Inbox size={18} color="#16a34a" />
              <Text style={styles.panelTitle}>提醒中心</Text>
            </View>
            <Pressable onPress={markAllRead}>
              <Text style={styles.linkText}>全部已讀</Text>
            </Pressable>
          </View>
          {(state.alerts || []).slice(0, 30).map(alert => (
            <Pressable key={alert.id} style={[styles.alertItem, !alert.read && styles.alertUnread]} onPress={() => {
              setSelectedAlert(alert);
              if (!alert.read) updateAlert(alert, { read: true });
            }}>
              <View style={styles.alertMain}>
                <Text style={styles.alertTitle}>{alert.title}</Text>
                <Text style={styles.alertBody}>{alert.body}</Text>
                <Text style={styles.alertMeta}>{alert.locationName || '主要地點'} · {alert.source || '系統'} · {dataStatusLabels[alert.dataStatus] || '資料狀態未知'} · {new Date(alert.createdAt).toLocaleString()}</Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </Pressable>
          ))}
          {(!state.alerts || state.alerts.length === 0) && <Text style={styles.empty}>尚無提醒，按「立即檢查」產生第一批提醒。</Text>}
        </View>

        {selectedAlert && (
          <View style={styles.panel}>
            <View style={styles.rowBetween}>
              <Text style={styles.panelTitle}>{selectedAlert.title}</Text>
              <Pressable onPress={() => setSelectedAlert(null)}>
                <Text style={styles.linkText}>關閉</Text>
              </Pressable>
            </View>
            <Text style={styles.detailBody}>{selectedAlert.body}</Text>
            <Text style={styles.alertMeta}>來源：{selectedAlert.source || '系統'} · 狀態：{dataStatusLabels[selectedAlert.dataStatus] || '資料狀態未知'} · 分類：{moduleLabels[selectedAlert.moduleId] || selectedAlert.moduleId}</Text>
            <View style={styles.buttonRow}>
              <Pressable style={styles.secondaryButton} onPress={() => updateAlert(selectedAlert, { read: true })}>
                <Eye size={16} color="#0f172a" />
                <Text style={styles.secondaryButtonText}>已讀</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => updateAlert(selectedAlert, { archived: true })}>
                <Archive size={16} color="#0f172a" />
                <Text style={styles.secondaryButtonText}>封存</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.panel}>
          <View style={styles.rowStart}>
            <Database size={18} color="#0891b2" />
            <Text style={styles.panelTitle}>管理概況</Text>
          </View>
          <Text style={styles.muted}>裝置 {admin?.devices || 0} · 使用者 {admin?.users || 0} · 全站提醒 {admin?.alerts || 0} · 啟用規則 {admin?.enabledRules || 0}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 18, gap: 16 },
  loadingShell: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 12, color: '#64748b', fontWeight: '700', letterSpacing: 0 },
  title: { fontSize: 30, color: '#0f172a', fontWeight: '800' },
  iconButton: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  iconMini: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  panel: { backgroundColor: '#ffffff', borderRadius: 8, padding: 14, gap: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 16, color: '#0f172a', fontWeight: '700' },
  muted: { color: '#64748b', fontSize: 13, lineHeight: 18 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#ffffff' },
  inputFull: { minHeight: 42, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#ffffff' },
  buttonRow: { flexDirection: 'row', gap: 10 },
  primaryButton: { flex: 1, minHeight: 44, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 12 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  secondaryButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  secondaryButtonText: { color: '#0f172a', fontWeight: '800' },
  metricRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, minHeight: 70, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  metricLabel: { color: '#64748b', fontSize: 12, marginTop: 2 },
  locationItem: { minHeight: 58, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  locationTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  tabs: { gap: 8, paddingVertical: 2 },
  tab: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  tabSelected: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tabText: { color: '#334155', fontWeight: '700' },
  tabTextSelected: { color: '#ffffff' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 20, color: '#0f172a', fontWeight: '800' },
  sectionSub: { maxWidth: 220, color: '#64748b', fontSize: 13, marginTop: 3 },
  checkButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 8, backgroundColor: '#16a34a' },
  checkButtonText: { color: '#ffffff', fontWeight: '800' },
  ruleList: { gap: 10 },
  ruleItem: { minHeight: 74, backgroundColor: '#ffffff', borderRadius: 8, padding: 13, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  ruleMain: { flex: 1, paddingRight: 4 },
  ruleTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  ruleMeta: { color: '#64748b', fontSize: 12, marginTop: 4 },
  severityPill: { minWidth: 46, height: 30, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  severityCritical: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  severityText: { color: '#334155', fontSize: 12, fontWeight: '800' },
  severityTextCritical: { color: '#dc2626' },
  linkText: { color: '#2563eb', fontSize: 13, fontWeight: '800' },
  alertItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  alertUnread: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, borderTopWidth: 0 },
  alertMain: { flex: 1 },
  alertTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  alertBody: { color: '#475569', fontSize: 13, marginTop: 3 },
  alertMeta: { color: '#64748b', fontSize: 11, marginTop: 5 },
  detailBody: { color: '#334155', fontSize: 15, lineHeight: 22 },
  empty: { color: '#64748b', fontSize: 13, paddingVertical: 12 }
});
