import 'dart:io';

import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_android/shared_preferences_android.dart';

import 'api.dart';

const _canale = MethodChannel('com.example.mobile/tracking');

const _opzioniAndroid = SharedPreferencesAsyncAndroidOptions(
  backend: SharedPreferencesAndroidBackendLibrary.SharedPreferences,
  originalSharedPreferencesOptions: AndroidSharedPreferencesStoreOptions(fileName: 'tec_tracking'),
);

/// Stesso file che legge il servizio Android. Su DataStore il servizio non può
/// scrivere senza rischiare di corrompere il file mentre l'app è aperta.
SharedPreferencesAsync preferenze() {
  if (!Platform.isAndroid) return SharedPreferencesAsync();
  return SharedPreferencesAsync(options: _opzioniAndroid);
}

/// Copia il token dal DataStore (versione precedente) nel file del servizio.
Future<void> migraPreferenze() async {
  if (!Platform.isAndroid) return;
  final dest = preferenze();
  if (await dest.getString('token') != null) return;
  final src = SharedPreferencesAsync();
  final token = await src.getString('token');
  if (token == null) return;
  final username = await src.getString('username');
  final password = await src.getString('password');
  final intervallo = await src.getInt('intervallo');
  final ultimo = await src.getString('ultimo_invio');
  final errore = await src.getString('ultimo_errore');
  final lat = await src.getDouble('ultima_lat');
  final lon = await src.getDouble('ultima_lon');
  if (username != null) await dest.setString('username', username);
  if (password != null) await dest.setString('password', password);
  await dest.setString('token', token);
  await dest.setString('base_url', baseUrl);
  if (intervallo != null) await dest.setInt('intervallo', intervallo);
  if (ultimo != null) await dest.setString('ultimo_invio', ultimo);
  if (errore != null) await dest.setString('ultimo_errore', errore);
  if (lat != null) await dest.setDouble('ultima_lat', lat);
  if (lon != null) await dest.setDouble('ultima_lon', lon);
  await src.clear();
}

/// Avvia il servizio solo con la posizione "durante l'uso" (Android 14+ la esige per il FGS location).
Future<bool> avviaTracking() async {
  if (!Platform.isAndroid) return false;
  final loc = await Geolocator.checkPermission();
  if (loc != LocationPermission.whileInUse && loc != LocationPermission.always) return false;
  await preferenze().setString('base_url', baseUrl);
  try {
    await _canale.invokeMethod<void>('start');
    return true;
  } catch (_) {
    return false;
  }
}

/// Il servizio rilegge l'intervallo e rifà la richiesta di posizione, senza un campione extra.
Future<void> aggiornaIntervallo() async {
  if (!Platform.isAndroid) return;
  final loc = await Geolocator.checkPermission();
  if (loc != LocationPermission.whileInUse && loc != LocationPermission.always) return;
  try {
    await _canale.invokeMethod<void>('aggiorna');
  } catch (_) {}
}

Future<void> fermaTracking() async {
  if (!Platform.isAndroid) return;
  try {
    await _canale.invokeMethod<void>('stop');
  } catch (_) {}
}

/// Campione manuale, a schermo acceso. Il servizio in background non passa di qui.
Future<void> inviaOra() async {
  final prefs = preferenze();
  try {
    final pos = await Geolocator.getCurrentPosition(
      locationSettings: Platform.isAndroid
          ? AndroidSettings(accuracy: LocationAccuracy.high, timeLimit: const Duration(seconds: 20))
          : const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
    );
    await _invia(prefs, pos.latitude, pos.longitude);
    await prefs.setDouble('ultima_lat', pos.latitude);
    await prefs.setDouble('ultima_lon', pos.longitude);
    await prefs.setString('ultimo_invio', DateTime.now().toIso8601String());
    await prefs.setInt('ultimo_invio_ms', DateTime.now().millisecondsSinceEpoch);
    await prefs.remove('ultimo_errore');
  } catch (e) {
    await prefs.setString('ultimo_errore', '$e');
  }
}

Future<void> _invia(SharedPreferencesAsync prefs, double lat, double lon) async {
  try {
    await inviaPosizione((await prefs.getString('token'))!, lat, lon);
  } on ApiError catch (e) {
    if (e.status != 401) rethrow;
    final token = await login((await prefs.getString('username'))!, (await prefs.getString('password'))!);
    await prefs.setString('token', token);
    await inviaPosizione(token, lat, lon);
  }
}
