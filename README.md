# GhostTags 👻

A location-based augmented reality (AR) social game where users create, discover, and visit virtual "ghost tags" at real-world locations using GPS and device camera.

## 🎮 Features

- **AR Visualization** - View ghost tags through your device camera with real-time AR overlays
- **Location-Based Gameplay** - Create tags at your current location; discover nearby tags within ~100m radius
- **Real-Time Multiplayer** - Instant tag synchronization across all players using Firebase Firestore
- **Scoring & Streaks** - Earn points for visiting other players' tags with consecutive visit streaks
- **Push Notifications** - Receive alerts when tags enter your proximity zone (~3km radius)
- **User Profiles** - Generate unique usernames, customize gender preference, track personal scores
- **Smart Tag Filtering** - Organize tags by category: My Tags, Nearby Unvisited, Visited, and Away
- **Cross-Platform** - Works seamlessly on iOS, Android, and Web

## 🚀 Tech Stack

- **Frontend**: React Native, Expo, TypeScript
- **Backend**: Firebase/Firestore (real-time database)
- **Navigation**: Expo Router (file-based routing)
- **AR & Camera**: Expo Camera API
- **Location Services**: Expo Location, Device Sensors
- **State Management**: React Hooks + AsyncStorage
- **UI Components**: Expo Vector Icons, Linear Gradient, Blur Effects

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Expo CLI** - `npm install -g expo-cli`
- **EAS CLI** (for building) - `npm install -g eas-cli`
- **Firebase Account** - [Create one](https://firebase.google.com/)

## 🔧 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/sujalkumarchoudhary/GhostTags
   cd ghosttags
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure Firebase**
   - Create a Firebase project at [firebase.google.com](https://firebase.google.com)
   - Enable Firestore Database
   - Get your Firebase config credentials
   - Create a `.env.local` file in the project root:
     ```
     EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
     EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
     EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
     EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
     EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
     ```
   - Update `firebaseConfig.ts` to use environment variables

4. **Request Permissions**
   - The app will request camera and location permissions on first launch
   - Grant permissions to enable full functionality

## 📱 Running the App

### Development

```bash
# Start the Expo dev server
npm start

# Run on Android emulator
npm run android

# Run on iOS simulator
npm run ios

# Run on Web
npm run web
```

### Production Build

#### Build APK (Android)

```bash
# Using EAS Build (Recommended)
eas build --platform android --local

# Or via Expo
expo build:android
```

#### Build IPA (iOS)

```bash
eas build --platform ios --local
```

#### Build Web

```bash
npm run web
```

## 📁 Project Structure

```
ghosttags/
├── app/
│   └── index.tsx           # Main app component with AR logic
├── assets/
│   └── images/             # Icons, splash screens
├── constants/
│   └── theme.ts            # Color & font configurations
├── hooks/
│   ├── use-color-scheme.ts
│   └── use-theme-color.ts
├── firebaseConfig.ts       # Firebase initialization
├── package.json
├── app.json               # Expo configuration
├── eas.json              # EAS Build configuration
└── tsconfig.json         # TypeScript configuration
```

## 📍 Key Configuration Values

In `app/index.tsx`:

- `FOV` - Field of view for AR visualization (50°)
- `VISIBILITY_RADIUS` - Distance to show tags in AR (100m)
- `CAPTURE_RADIUS` - Distance to mark tag as visited (5m)
- `NOTIFICATION_RADIUS` - Push notification trigger distance (3km)
- `NEARBY_RADIUS` - Distance to show tags in "Nearby" list (15km)
- `SMOOTHING_FACTOR` - Compass heading smoothing (0.1)

## 🎯 How to Play

1. **Launch the app** and set your gender preference
2. **Allow camera & location permissions**
3. **Create a tag** - Tap the "+" button to create a tag at your current location
4. **View tags** - Look through your camera to see nearby tags in AR
5. **Visit tags** - Get within 5m of a tag to mark it as visited and earn points
6. **Check leaderboard** - View your score and other players' achievements

## 🔐 Security Notes

⚠️ **Important**: Never commit Firebase credentials to version control

- Use environment variables (`.env.local`) for sensitive data
- Create a `.gitignore` entry for `firebaseConfig.ts` and `.env.local`
- See [Security Best Practices](#security-best-practices) below

### Security Best Practices

1. **Firebase Rules** - Implement Firestore security rules to validate user actions
2. **Input Validation** - Validate tag text and user inputs
3. **Rate Limiting** - Prevent spam by limiting tag creation frequency
4. **User Verification** - Consider adding authentication for production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/sujalkumarchoudhary/GhostTags/issue)
- **Email**: your.email@example.com

## 🙏 Acknowledgments

- Built with [Expo](https://expo.dev)
- Powered by [Firebase](https://firebase.google.com)
- Icons from [@expo/vector-icons](https://icons.expo.fyi)

---

**Made with ❤️ by [Sujal]**
