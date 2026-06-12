import { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { signOut } from './features/auth'
import type { Parcel } from './features/parcels'
import { AgentScreen } from './screens/AgentScreen'
import { AuthScreen } from './screens/AuthScreen'
import { HomeScreen } from './screens/HomeScreen'
import { ParcelDetailScreen } from './screens/ParcelDetailScreen'
import { QrScanScreen } from './screens/QrScanScreen'

type Tab = 'home' | 'agent' | 'qr'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function handleSignOut() {
    await signOut()
    setSelectedParcel(null)
    setTab('home')
    setUser(null)
  }

  function handleParcelChanged() {
    setSelectedParcel(null)
    setRefreshKey((current) => current + 1)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator />
      </SafeAreaView>
    )
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <AuthScreen onSignedIn={setUser} />
        <StatusBar style="auto" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>ShareKeep</Text>
        <Pressable onPress={handleSignOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {selectedParcel ? (
        <ParcelDetailScreen
          onBack={() => setSelectedParcel(null)}
          onChanged={handleParcelChanged}
          parcel={selectedParcel}
          user={user}
        />
      ) : (
        <>
          <View style={styles.tabs}>
            <TabButton active={tab === 'home'} label="Home" onPress={() => setTab('home')} />
            <TabButton active={tab === 'agent'} label="Agent" onPress={() => setTab('agent')} />
            <TabButton active={tab === 'qr'} label="QR" onPress={() => setTab('qr')} />
          </View>
          {tab === 'home' ? (
            <HomeScreen key={refreshKey} onSelectParcel={setSelectedParcel} user={user} />
          ) : null}
          {tab === 'agent' ? <AgentScreen /> : null}
          {tab === 'qr' ? <QrScanScreen /> : null}
        </>
      )}

      <StatusBar style="auto" />
    </SafeAreaView>
  )
}

function TabButton({
  active,
  label,
  onPress,
}: {
  active: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  brand: {
    color: '#17352d',
    fontSize: 22,
    fontWeight: '800',
  },
  container: {
    backgroundColor: '#fff',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#dce8e2',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  signOutButton: {
    borderColor: '#1f6f5b',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  signOutText: {
    color: '#1f6f5b',
    fontWeight: '700',
  },
  tabButton: {
    alignItems: 'center',
    borderColor: '#1f6f5b',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  tabButtonActive: {
    backgroundColor: '#1f6f5b',
  },
  tabText: {
    color: '#1f6f5b',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#fff',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
})
