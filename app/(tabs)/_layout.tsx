import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarStyle: { height: 65, paddingBottom: 10, paddingTop: 5 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="navigation"
        options={{
          title: 'Navegar',
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="location.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="reviews"
        options={{
          title: 'Reseñas',
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="star.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{ href: null }} // Oculto del menú, solo usado internamente
      />
      <Tabs.Screen
        name="explore"
        options={{ href: null }} // Oculto del menú
      />
    </Tabs>
  );
}