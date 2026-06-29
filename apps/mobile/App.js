import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { Bell, CalendarClock, CarFront, CheckCircle2, ChevronRight, CloudRain, Home, MapPin, RefreshCcw, ShieldAlert, Siren, SlidersHorizontal } from 'lucide-react-native';

const API_BASE = Constants.expoConfig?.extra?.apiBase || process.env.EXPO_PUBLIC_API_BASE || 'https://local-alert.yaojidecare.app';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false
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

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
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
  const [catalog, setCatalog] = useState([]);
  const [state, setState] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('environment');
  const [locationDraft, setLocationDraft] = useState({ city: '台北市', district: '信義區' });
  const [pushStatus, setPushStatus] = useState('尚未註冊');
  const [loading, setLoading] = useState(false);

  const selected = useMemo(() => catalog.find(item => item.id === selectedCategory), [catalog, selectedCategory]);
  const rules = useMemo(() => state?.rules?.filter(rule => rule.categoryId === selectedCategory) || [], [state, selectedCategory]);

  async function refresh() {
    const [catalogData, stateData] = await Promise.all([
      api('/api/catalog'),
      api('/api/state')
    ]);
    setCatalog(catalogData.categories);
    setState(stateData);
  }

  useEffect(() => {
    refresh().catch(error => Alert.alert('載入失敗', error.message));
  }, []);

  async function toggleRule(rule) {
    const result = await api(`/api/rules/${encodeURIComponent(rule.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !rule.enabled })
    });
    setState(current => ({ ...current, rules: result.rules }));
  }

  async function saveLocation() {
    const result = await api('/api/locations', {
      method: 'POST',
      body: JSON.stringify({
        label: `${locationDraft.city}${locationDraft.district}`,
        city: locationDraft.city,
        district: locationDraft.district
      })
    });
    setState(current => ({ ...current, locations: result.locations }));
    Alert.alert('已新增地點', `${locationDraft.city}${locationDraft.district}`);
  }

  async function enablePush() {
    try {
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        setPushStatus('未取得權限');
        Alert.alert('推播未啟用', '請在手機上授權通知。');
        return;
      }
      await api('/api/devices/register', {
        method: 'POST',
        body: JSON.stringify({ pushToken: token, platform: Platform.OS })
      });
      setPushStatus('已註冊手機推播');
    } catch (error) {
      Alert.alert('推播註冊失敗', error.message);
    }
  }

  async function runCheck() {
    setLoading(true);
    try {
      const result = await api('/api/check-now', { method: 'POST', body: JSON.stringify({}) });
      await refresh();
      Alert.alert('檢查完成', `已產生提醒，推播 ${result.pushed} 台裝置。`);
    } catch (error) {
      Alert.alert('檢查失敗', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendTestPush() {
    const result = await api('/api/test-push', { method: 'POST', body: JSON.stringify({}) });
    Alert.alert('測試推播', `已送出 ${result.pushed} 則。`);
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
          <Pressable style={styles.iconButton} onPress={refresh}>
            <RefreshCcw size={18} color="#0f172a" />
          </Pressable>
        </View>

        <View style={styles.locationPanel}>
          <View style={styles.rowBetween}>
            <View style={styles.rowStart}>
              <MapPin size={18} color="#2563eb" />
              <Text style={styles.panelTitle}>監控地點</Text>
            </View>
            <Text style={styles.muted}>{state?.locations?.length || 0} 個</Text>
          </View>
          <View style={styles.inputRow}>
            <TextInput style={styles.input} value={locationDraft.city} onChangeText={city => setLocationDraft(current => ({ ...current, city }))} />
            <TextInput style={styles.input} value={locationDraft.district} onChangeText={district => setLocationDraft(current => ({ ...current, district }))} />
            <Pressable style={styles.smallButton} onPress={saveLocation}>
              <Text style={styles.smallButtonText}>新增</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.pushPanel}>
          <View style={styles.rowStart}>
            <Bell size={18} color="#7c3aed" />
            <Text style={styles.panelTitle}>手機 App 推播</Text>
          </View>
          <Text style={styles.muted}>{pushStatus}</Text>
          <View style={styles.buttonRow}>
            <Pressable style={styles.primaryButton} onPress={enablePush}>
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
                <Text style={styles.ruleTitle}>{rule.moduleId}</Text>
                <Text style={styles.ruleMeta}>{rule.severity === 'critical' ? '高優先級' : '一般提醒'} · 安靜時段 {rule.quietHours.start}-{rule.quietHours.end}</Text>
              </View>
              <Switch value={rule.enabled} onValueChange={() => toggleRule(rule)} />
            </View>
          ))}
        </View>

        <View style={styles.alertPanel}>
          <View style={styles.rowBetween}>
            <Text style={styles.panelTitle}>最新提醒</Text>
            <CheckCircle2 size={18} color="#16a34a" />
          </View>
          {(state?.alerts || []).slice(0, 6).map(alert => (
            <View key={alert.id} style={styles.alertItem}>
              <View>
                <Text style={styles.alertTitle}>{alert.title}</Text>
                <Text style={styles.alertBody}>{alert.body}</Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </View>
          ))}
          {(!state?.alerts || state.alerts.length === 0) && <Text style={styles.empty}>尚無提醒，按「立即檢查」產生第一批提醒。</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 18, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  title: { fontSize: 30, color: '#0f172a', fontWeight: '800' },
  iconButton: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  locationPanel: { backgroundColor: '#ffffff', borderRadius: 8, padding: 14, gap: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  pushPanel: { backgroundColor: '#ffffff', borderRadius: 8, padding: 14, gap: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 16, color: '#0f172a', fontWeight: '700' },
  muted: { color: '#64748b', fontSize: 13 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#ffffff' },
  smallButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  smallButtonText: { color: '#ffffff', fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: 10 },
  primaryButton: { flex: 1, minHeight: 44, borderRadius: 8, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  secondaryButton: { minHeight: 44, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#0f172a', fontWeight: '800' },
  tabs: { gap: 8, paddingVertical: 2 },
  tab: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  tabSelected: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tabText: { color: '#334155', fontWeight: '700' },
  tabTextSelected: { color: '#ffffff' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 20, color: '#0f172a', fontWeight: '800' },
  sectionSub: { maxWidth: 220, color: '#64748b', fontSize: 13, marginTop: 3 },
  checkButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 8, backgroundColor: '#2563eb' },
  checkButtonText: { color: '#ffffff', fontWeight: '800' },
  ruleList: { gap: 10 },
  ruleItem: { minHeight: 70, backgroundColor: '#ffffff', borderRadius: 8, padding: 13, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ruleMain: { flex: 1, paddingRight: 12 },
  ruleTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  ruleMeta: { color: '#64748b', fontSize: 12, marginTop: 4 },
  alertPanel: { backgroundColor: '#ffffff', borderRadius: 8, padding: 14, gap: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  alertItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  alertTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  alertBody: { color: '#475569', fontSize: 13, marginTop: 3, maxWidth: 285 },
  empty: { color: '#64748b', fontSize: 13, paddingVertical: 12 }
});
