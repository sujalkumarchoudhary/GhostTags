import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react'; // Added useRef
import {
  Alert,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  SectionList,
  StatusBar,
  StyleSheet, Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

// --- FIREBASE IMPORTS ---
import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// --- CONFIG ---
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const { width, height } = Dimensions.get('window');
const FOV = 50; 
const VISIBILITY_RADIUS = 100;    
const CAPTURE_RADIUS = 5;         
const NOTIFICATION_RADIUS = 3000; 
const NEARBY_RADIUS = 15000;      
const AWAY_RADIUS = 15000; 
const SMOOTHING_FACTOR = 0.1; // Lower = Smoother but slower. 0.1 is a good balance.

interface ARTag {
  id: string;
  text: string;
  sub: string;
  latitude: number;
  longitude: number;
  color: string;
  rotation?: string;
  createdAt: any;
  userId?: string; 
  userGender?: string; 
  scale?: number;
  distance?: number;
  x?: number;
  y?: number;
}

const generateCoolName = (gender: string) => {
  const prefixes = ['Neon', 'Cyber', 'Ghost', 'Glitch', 'Shadow', 'Toxic', 'Hyper', 'Radio'];
  let suffixes = ['Phantom', 'Hunter', 'Runner', 'Punk', 'Viper', 'Wolf'];
  if (gender === 'male') suffixes = [...suffixes, 'King', 'Samurai', 'Soldier'];
  if (gender === 'female') suffixes = [...suffixes, 'Queen', 'Siren', 'Valkyrie'];
  if (gender === 'bot') suffixes = [...suffixes, 'Droid', 'Unit', 'System'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const s = suffixes[Math.floor(Math.random() * suffixes.length)];
  const n = Math.floor(Math.random() * 999);
  return `${p}-${s}-${n}`;
};

const getBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;
  const destLatRad = (destLat * Math.PI) / 180;
  const destLngRad = (destLng * Math.PI) / 180;
  const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
  const x = Math.cos(startLatRad) * Math.sin(destLatRad) - Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; 
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 250, 250], lightColor: '#FF231F7C',
    });
  }
  if (!Device.isDevice) return null;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (error) { return null; }
}

export default function HomeScreen() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [locPermission, requestLocPermission] = Location.useForegroundPermissions();
  
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [tags, setTags] = useState<ARTag[]>([]);
  
  const [myId, setMyId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>('Loading...');
  const [myGender, setMyGender] = useState<string>('bot');
  
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());

  const [modalVisible, setModalVisible] = useState(false);
  const [listVisible, setListVisible] = useState(false);
  const [genderModalVisible, setGenderModalVisible] = useState(false); 
  const [tagText, setTagText] = useState('');

  // Ref to hold the current heading for smooth animation calculation
  const currHeading = useRef(0);

  // 1. SETUP
  useEffect(() => {
    (async () => {
      await requestCamPermission();
      await requestLocPermission();

      try {
        let currentId = await AsyncStorage.getItem('ghost_user_id');
        let currentName = await AsyncStorage.getItem('ghost_user_name');
        let currentGender = await AsyncStorage.getItem('ghost_user_gender');
        const savedScore = parseInt(await AsyncStorage.getItem('ghost_user_score') || '0');
        setScore(savedScore);
        await checkStreak();

        if (!currentId || !currentGender) {
            currentId = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            await AsyncStorage.setItem('ghost_user_id', currentId);
            setMyId(currentId);
            setGenderModalVisible(true); 
        } else {
            setMyId(currentId);
            setMyName(currentName!);
            setMyGender(currentGender);
            
            const userDoc = await getDoc(doc(db, "users", currentId));
            if (userDoc.exists()) {
                const data = userDoc.data();
                if (data.visitedTags) {
                    setVisitedIds(new Set(data.visitedTags));
                }
            }
        }

        const token = await registerForPushNotificationsAsync();
        if (token && currentId) {
          await setDoc(doc(db, "users", currentId), { pushToken: token, lastSeen: Timestamp.now() }, { merge: true });
        }
      } catch (e) { console.log("Setup Error", e); }

      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 500, distanceInterval: 1 }, 
        (newLoc) => setLocation(newLoc)
      );

      // --- NEW: SMOOTH COMPASS WATCHER ---
      Location.watchHeadingAsync((obj) => {
        const { trueHeading, magHeading } = obj;
        let targetHeading = trueHeading !== -1 ? trueHeading : magHeading;
        
        // SMOOTHING LOGIC (Low Pass Filter)
        let current = currHeading.current;
        let diff = targetHeading - current;

        // Handle the 360->0 wrap-around
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;

        // Move only a fraction (SMOOTHING_FACTOR) towards the target
        const smoothed = current + (diff * SMOOTHING_FACTOR);
        
        // Update Ref and State
        currHeading.current = smoothed;
        
        // Normalize for display (0-360)
        let displayHeading = smoothed % 360;
        if (displayHeading < 0) displayHeading += 360;
        
        setHeading(displayHeading);
      });

      const q = query(collection(db, "tags"), orderBy("createdAt", "desc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setTags(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ARTag)));
      });

      return () => unsubscribe();
    })();
  }, []);

  // --- STATS LOGIC ---
  const checkStreak = async () => {
    try {
      const now = new Date();
      const todayDate = now.toDateString(); 
      const lastActive = await AsyncStorage.getItem('ghost_user_last_active');
      let currentStreak = parseInt(await AsyncStorage.getItem('ghost_user_streak') || '0');

      if (lastActive !== todayDate) {
         const yesterday = new Date(now);
         yesterday.setDate(yesterday.getDate() - 1);
         if (lastActive === yesterday.toDateString()) {
            currentStreak += 1; 
         } else if (lastActive !== todayDate) {
            currentStreak = 1; 
         }
         await AsyncStorage.setItem('ghost_user_last_active', todayDate);
         await AsyncStorage.setItem('ghost_user_streak', currentStreak.toString());
         setStreak(currentStreak);
      } else { setStreak(currentStreak); }
    } catch(e) {}
  };

  const incrementScore = async (amount: number) => {
      const newScore = score + amount;
      setScore(newScore);
      await AsyncStorage.setItem('ghost_user_score', newScore.toString());
      if (myId) await updateDoc(doc(db, "users", myId), { score: newScore });
  };

  // --- 2. LOGIC: LIST FILTERING ---
  const { arTags, listSections, nearestTarget } = useMemo(() => {
    if (!location) return { arTags: [], listSections: [], nearestTarget: null };

    const processedTags = tags.map((tag) => {
      const distance = getDistance(
        location.coords.latitude, location.coords.longitude,
        tag.latitude, tag.longitude
      );
      return { ...tag, distance };
    });

    const myTagsList: ARTag[] = []; 
    const nearbyUnvisited: ARTag[] = [];
    const visitedList: ARTag[] = [];
    const awayList: ARTag[] = [];

    processedTags.forEach(tag => {
        const isMine = tag.userId === myId;
        const isVisited = visitedIds.has(tag.id);
        
        if (isMine) {
            myTagsList.push(tag);
        } else if (isVisited) {
            visitedList.push(tag);
        } else if (tag.distance! > NEARBY_RADIUS) { 
            awayList.push(tag);
        } else {
            nearbyUnvisited.push(tag);
        }
    });

    myTagsList.sort((a, b) => b.createdAt - a.createdAt); 
    nearbyUnvisited.sort((a, b) => a.distance! - b.distance!);
    visitedList.sort((a, b) => a.distance! - b.distance!);
    awayList.sort((a, b) => a.distance! - b.distance!);

    const nearestTarget = nearbyUnvisited.length > 0 ? nearbyUnvisited[0] : null;

    const arVisible = processedTags.filter(tag => {
        const isMine = tag.userId === myId;
        const isVisited = visitedIds.has(tag.id);
        return (isMine || !isVisited) && tag.distance! <= VISIBILITY_RADIUS;
    }).map((tag) => {
      const scale = Math.max(0.6, 1 - (tag.distance! / VISIBILITY_RADIUS)); 
      const bearing = getBearing(
        location.coords.latitude, location.coords.longitude,
        tag.latitude, tag.longitude
      );
      
      let delta = bearing - heading;
      // Handle Wrap Around for AR Position too
      while (delta < -180) delta += 360;
      while (delta > 180) delta -= 360;

      if (Math.abs(delta) > FOV / 2) return null; 
      const x = (width / 2) + (delta * (width / FOV)); 
      return { ...tag, x, y: height * 0.4, scale }; 
    }).filter((t) => t !== null) as ARTag[];

    const sections = [
        { title: `🎨 MY TAGS (${myTagsList.length})`, data: myTagsList },
        { title: `📍 NEARBY (<15km) (${nearbyUnvisited.length})`, data: nearbyUnvisited },
        { title: `🎒 VISITED (${visitedList.length})`, data: visitedList },
        { title: `🌍 AWAY (>15km) (${awayList.length})`, data: awayList } 
    ];

    return { arTags: arVisible, listSections: sections, nearestTarget };
  }, [location, heading, tags, visitedIds, myId]);


  // --- 3. AUTO-COLLECTOR ---
  useEffect(() => {
      if(!location) return;
      tags.forEach(async (tag) => {
          if (visitedIds.has(tag.id)) return; 
          if (tag.userId === myId) return; 

          const distance = getDistance(
            location.coords.latitude, location.coords.longitude,
            tag.latitude, tag.longitude
          );

          if (distance <= CAPTURE_RADIUS) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("TAG FOUND!", `You discovered "${tag.text}"\n+50 XP`);
              const newSet = new Set(visitedIds);
              newSet.add(tag.id);
              setVisitedIds(newSet);
              await incrementScore(50);
              if (myId) {
                  await updateDoc(doc(db, "users", myId), {
                      visitedTags: arrayUnion(tag.id)
                  });
              }
          }
      });
  }, [location]); 

  // --- 4. NOTIFICATION TRIGGER ---
  useEffect(() => {
    if(!location) return;
    tags.forEach((tag) => {
        if (tag.userId === myId) return;
        if (visitedIds.has(tag.id)) return;
        if (notifiedIds.has(tag.id)) return;

        const distance = getDistance(
            location.coords.latitude, location.coords.longitude,
            tag.latitude, tag.longitude
        );

        if (distance <= NOTIFICATION_RADIUS) {
            Notifications.scheduleNotificationAsync({
                content: {
                    title: "📶 SIGNAL DETECTED",
                    body: `A Ghost Tag "${tag.text}" is nearby (${Math.round(distance)}m).`,
                    sound: true,
                },
                trigger: null, 
            }).catch(() => {});
            setNotifiedIds(prev => new Set(prev).add(tag.id));
        }
    });
  }, [location, tags]);


  // --- HANDLERS ---
  const openSprayModal = () => {
    if(!location) return Alert.alert("Wait", "Finding GPS...");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setModalVisible(true);
  };

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newLoc = await Location.getCurrentPositionAsync({});
    setLocation(newLoc);
    await checkStreak(); 
    Alert.alert("Refreshed", "GPS Updated 🛰️");
  };

  const selectGender = async (gender: string) => {
      const name = generateCoolName(gender);
      setMyName(name);
      setMyGender(gender);
      await AsyncStorage.setItem('ghost_user_gender', gender);
      await AsyncStorage.setItem('ghost_user_name', name);
      if (myId) {
          await setDoc(doc(db, "users", myId), { gender: gender, name: name }, { merge: true });
      }
      setGenderModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const onSaveTag = async () => {
    if (tagText.trim() === '') return;
    Keyboard.dismiss();
    setModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const headingRad = (heading * Math.PI) / 180; 
    const newLat = location!.coords.latitude + (0.00005 * Math.cos(headingRad));
    const newLong = location!.coords.longitude + (0.00005 * Math.sin(headingRad));

    try {
      await addDoc(collection(db, "tags"), {
        text: tagText, sub: myName, userId: myId, userGender: myGender,
        latitude: newLat, longitude: newLong,
        color: Math.random() > 0.5 ? '#00F0FF' : '#FF0099',
        rotation: `${Math.floor(Math.random() * 10) - 5}deg`, 
        createdAt: Timestamp.now()
      });

      if (myId) {
        await setDoc(doc(db, "users", myId), { 
            latitude: newLat, longitude: newLong, lastSeen: Timestamp.now()
        }, { merge: true });
      }
      
      await incrementScore(50);
      await checkStreak();
      setTagText('');
    } catch (e) { Alert.alert("Error", "Check internet."); }
  };

  const onDeleteTag = (tag: ARTag) => {
    if (tag.userId !== myId) return; 
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Delete Tag?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          try {
            await deleteDoc(doc(db, "tags", tag.id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch(e) { Alert.alert("Error", "Could not delete."); }
        }}
    ]);
  };

  const getGenderIcon = (gender?: string) => {
      if (gender === 'male') return "face-man-profile";
      if (gender === 'female') return "face-woman-profile";
      return "robot"; 
  };

  const getArrowRotation = () => {
    if (!nearestTarget || !location) return '0deg';
    const bearing = getBearing(
      location.coords.latitude, location.coords.longitude,
      nearestTarget.latitude, nearestTarget.longitude
    );
    let rotation = bearing - heading; 
    return `${rotation}deg`;
  };

  if (!camPermission?.granted || !locPermission?.granted) return <View style={styles.center}><Text style={{color:'white'}}>Waiting for Permissions...</Text></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
        
      {/* LAYER 2: AR VIEW */}
      <View style={styles.arLayer} pointerEvents="none"> 
        {arTags.map((tag: any) => (
            <View key={tag.id} style={[styles.arTagContainer, { left: tag.x - 100, top: tag.y, transform: [{ scale: tag.scale }, { rotate: tag.rotation || '0deg' }] }]}>
              <BlurView intensity={40} tint="dark" style={[styles.glassBubble, { borderColor: tag.color, shadowColor: tag.color }]}>
                <View style={styles.bubbleIconContainer}>
                  <MaterialCommunityIcons name={getGenderIcon(tag.userGender)} size={28} color={tag.color} />
                </View>
                <View style={styles.bubbleTextContainer}>
                  <Text style={[styles.neonText, { textShadowColor: tag.color }]}>{tag.text.toUpperCase()}</Text>
                  <Text style={styles.subText}>{tag.sub} • {tag.userId === myId ? "YOU" : Math.round(tag.distance) + "m"}</Text>
                </View>
              </BlurView>
              <View style={[styles.triangle, { borderTopColor: tag.color }]} />
            </View>
          ))}
      </View>

      {/* LAYER 3: HUD UI */}
      <View style={styles.safeArea}>
          <BlurView intensity={80} tint="dark" style={styles.topBar}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>GHOST<Text style={{color: '#00F0FF'}}>TAGS</Text></Text>
            </View>
            <View style={styles.statsContainer}>
              <View style={styles.identityRow}>
                 <Text style={styles.idLabel}>AGENT:</Text>
                 <Text style={styles.idName}>{myName}</Text>
              </View>
              <View style={styles.scoreRow}>
                 <Text style={styles.statText}>🔥 {streak} </Text>
                 <Text style={[styles.statText, { color: '#FFD700' }]}>🏆 {score}</Text>
              </View>
            </View>
          </BlurView>

          <View style={styles.bottomControlsContainer}>
            <TouchableOpacity onPress={handleRefresh} style={styles.sideButton}>
              <Ionicons name="refresh" size={24} color="white" />
              <Text style={styles.sideButtonText}>Refresh</Text>
            </TouchableOpacity>

            <View style={{alignItems: 'center'}}>
                {nearestTarget && (
                    <View style={styles.navArrowContainer}>
                        <View style={{ transform: [{ rotate: getArrowRotation() }] }}>
                            <Ionicons name="navigate" size={30} color="#00FF00" />
                        </View>
                        <Text style={styles.navDistanceText}>{Math.round(nearestTarget.distance || 0)}m</Text>
                    </View>
                )}

                <TouchableOpacity onPress={openSprayModal} activeOpacity={0.8}>
                <LinearGradient colors={['#00F0FF', '#0099FF']} style={styles.sprayButton}>
                    <MaterialCommunityIcons name="spray-bottle" size={32} color="black" />
                </LinearGradient>
                </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setListVisible(true)} style={styles.sideButton}>
              <Feather name="list" size={24} color="white" />
              <Text style={styles.sideButtonText}>List</Text>
            </TouchableOpacity>
          </View>
      </View>

      {/* LAYER 4: INPUT MODAL */}
      <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <BlurView intensity={90} tint="dark" style={styles.modalContent}>
            <Text style={styles.modalTitle}>NEW GRAFFITI</Text>
            <TextInput 
                style={styles.input} 
                placeholder="Type your tag..." 
                placeholderTextColor="#888" 
                autoFocus={true} 
                maxLength={25} 
                value={tagText} 
                onChangeText={setTagText} 
                returnKeyType="done"
                onSubmitEditing={onSaveTag}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.cancelText}>CANCEL</Text></TouchableOpacity>
              <TouchableOpacity onPress={onSaveTag} style={styles.postButton}>
                <Text style={styles.postText}>SPRAY IT (+50XP)</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>

      {/* LAYER 5: LIST VIEW MODAL */}
      <Modal animationType="slide" visible={listVisible} presentationStyle="pageSheet" onRequestClose={() => setListVisible(false)}>
        <View style={styles.listContainer}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>TAG DATABASE</Text>
            <TouchableOpacity onPress={() => setListVisible(false)}>
              <Ionicons name="close-circle" size={30} color="#FF0099" />
            </TouchableOpacity>
          </View>
          
          <SectionList
            sections={listSections}
            keyExtractor={(item) => item.id}
            renderSectionHeader={({ section: { title } }) => (
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>{title}</Text>
                </View>
            )}
            renderItem={({ item }) => (
              <View style={[styles.listItem, visitedIds.has(item.id) && { borderLeftColor: '#00FF00' }, item.userId === myId && { borderLeftColor: '#00F0FF' }]}>
                <View style={styles.listInfo}>
                  <Text style={styles.listItemText}>{item.text}</Text>
                  <Text style={styles.listItemSub}>
                      {item.sub} • {item.userId === myId ? "CREATED" : (visitedIds.has(item.id) ? "COLLECTED" : "UNCOLLECTED")}
                  </Text>
                </View>
                <View style={styles.listMeta}>
                  <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Text style={[styles.listDistance, visitedIds.has(item.id) && {color:'#00FF00'}]}>
                        {item.distance! > 1000 ? (item.distance!/1000).toFixed(1) + 'km' : Math.round(item.distance!) + 'm'}
                    </Text>
                    {item.userId === myId && (
                       <TouchableOpacity onPress={() => onDeleteTag(item)} style={styles.deleteButton}>
                          <Ionicons name="trash-bin" size={20} color="#FF3333" />
                       </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={{color:'#666', textAlign:'center', marginTop: 50}}>No tags found.</Text>}
          />
        </View>
      </Modal>

      {/* LAYER 6: AGENT MODAL */}
      <Modal animationType="slide" transparent={true} visible={genderModalVisible} onRequestClose={() => {}}>
        <View style={styles.modalContainer}>
          <BlurView intensity={100} tint="dark" style={[styles.modalContent, { borderColor: '#FF0099' }]}>
            <Text style={[styles.modalTitle, { color: '#FF0099' }]}>SELECT AGENT</Text>
            <Text style={{color:'white', marginBottom: 20, textAlign:'center'}}>Choose your identity protocol.</Text>
            <View style={styles.agentRow}>
                <TouchableOpacity onPress={() => selectGender('male')} style={styles.agentButton}>
                    <MaterialCommunityIcons name="face-man-profile" size={50} color="#00F0FF" />
                    <Text style={styles.agentText}>OPERATIVE</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => selectGender('female')} style={styles.agentButton}>
                    <MaterialCommunityIcons name="face-woman-profile" size={50} color="#FF0099" />
                    <Text style={styles.agentText}>SIREN</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => selectGender('bot')} style={[styles.agentButton, { marginTop: 20 }]}>
                    <MaterialCommunityIcons name="robot" size={50} color="#00FF00" />
                    <Text style={styles.agentText}>PHANTOM (ANON)</Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  arLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  arTagContainer: { position: 'absolute', alignItems: 'center', width: 200 }, 
  glassBubble: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 16, borderWidth: 2, backgroundColor: 'rgba(0, 0, 0, 0.4)', overflow: 'hidden', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 15, elevation: 10 },
  bubbleIconContainer: { marginRight: 10 },
  bubbleTextContainer: { flex: 1 },
  neonText: { color: 'white', fontSize: 20, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'sans-serif-condensed', letterSpacing: 1, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  subText: { color: '#ddd', fontSize: 10, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  triangle: { width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid', borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 0, borderTopWidth: 15, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -2, shadowOpacity: 0.5, shadowRadius: 5 },
  safeArea: { ...StyleSheet.absoluteFillObject, zIndex: 2, justifyContent: 'space-between', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 10 : 50, paddingBottom: 40 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, padding: 12, borderRadius: 20, overflow: 'hidden', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
  logoContainer: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 15 },
  logoText: { color: 'white', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  statsContainer: { alignItems: 'flex-end' },
  identityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  idLabel: { color: '#666', fontSize: 8, fontWeight: 'bold', marginRight: 4 },
  idName: { color: '#00F0FF', fontSize: 12, fontWeight: 'bold' },
  statText: { color: 'white', fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  bottomControlsContainer: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  sprayButton: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)', shadowColor: '#00F0FF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 15 },
  sideButton: { alignItems: 'center', justifyContent: 'center', width: 60 },
  sideButtonText: { color: 'white', fontSize: 10, marginTop: 4, opacity: 0.7 },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { width: width * 0.85, borderRadius: 20, padding: 25, alignItems: 'center', borderColor: '#00F0FF', borderWidth: 1, overflow: 'hidden' },
  modalTitle: { color: '#00F0FF', fontSize: 22, fontWeight: '900', marginBottom: 20, letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  input: { width: '100%', backgroundColor: '#111', color: 'white', padding: 15, borderRadius: 10, fontSize: 18, borderWidth: 1, borderColor: '#333', marginBottom: 25 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' },
  cancelText: { color: '#888', fontWeight: 'bold', marginLeft: 10 },
  postButton: { backgroundColor: '#00F0FF', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25 },
  postText: { color: 'black', fontWeight: '900' },
  listContainer: { flex: 1, backgroundColor: '#111', padding: 20 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 20 },
  listTitle: { color: 'white', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  sectionHeader: { backgroundColor: '#111', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333', marginTop: 10 },
  sectionHeaderText: { color: '#888', fontWeight: '900', letterSpacing: 2 },
  listItem: { backgroundColor: '#222', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: '#00F0FF' },
  listInfo: { flex: 1 },
  listItemText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  listItemSub: { color: '#888', fontSize: 12 },
  listMeta: { alignItems: 'flex-end' },
  listDistance: { color: '#00F0FF', fontWeight: 'bold', fontSize: 14, marginBottom: 2 },
  deleteButton: { marginLeft: 10, padding: 5, backgroundColor: 'rgba(255,0,0,0.1)', borderRadius: 5 },
  agentRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  agentButton: { alignItems: 'center', padding: 10, borderWidth: 1, borderColor: '#333', borderRadius: 10, width: 100 },
  agentText: { color: 'white', fontWeight: 'bold', marginTop: 5, fontSize: 10 },
  
  // --- NAV ARROW STYLES ---
  navArrowContainer: {
    position: 'absolute',
    top: -50, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDistanceText: {
    color: '#00FF00',
    fontWeight: '900',
    fontSize: 10,
    marginTop: 2,
    textShadowColor: '#000',
    textShadowRadius: 5,
  }
});