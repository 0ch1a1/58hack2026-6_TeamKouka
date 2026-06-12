import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { findNearbyAgents } from '../features/parcels'

export function AgentScreen() {
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [radiusMeters, setRadiusMeters] = useState('50')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSearch() {
    setLoading(true)
    setResult('')

    try {
      const data = await findNearbyAgents({
        latitude: Number(latitude),
        longitude: Number(longitude),
        radiusMeters: Number(radiusMeters || 50),
      })
      setResult(JSON.stringify(data, null, 2))
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Nearby agents</Text>
      <TextInput
        keyboardType="decimal-pad"
        onChangeText={setLatitude}
        placeholder="latitude"
        style={styles.input}
        value={latitude}
      />
      <TextInput
        keyboardType="decimal-pad"
        onChangeText={setLongitude}
        placeholder="longitude"
        style={styles.input}
        value={longitude}
      />
      <TextInput
        keyboardType="number-pad"
        onChangeText={setRadiusMeters}
        placeholder="radius meters"
        style={styles.input}
        value={radiusMeters}
      />
      <Pressable
        disabled={loading || !latitude || !longitude}
        onPress={handleSearch}
        style={[styles.button, (loading || !latitude || !longitude) && styles.disabled]}
      >
        <Text style={styles.buttonText}>Search</Text>
      </Pressable>
      {loading ? <ActivityIndicator /> : null}
      {result ? <Text selectable style={styles.result}>{result}</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#1f6f5b',
    borderRadius: 8,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  content: {
    gap: 12,
    padding: 16,
  },
  disabled: {
    opacity: 0.45,
  },
  heading: {
    color: '#17352d',
    fontSize: 22,
    fontWeight: '800',
  },
  input: {
    borderColor: '#cbd5d1',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  result: {
    backgroundColor: '#f7faf8',
    borderRadius: 8,
    color: '#17352d',
    padding: 12,
  },
})
