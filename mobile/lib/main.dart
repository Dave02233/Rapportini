import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

import 'api.dart';
import 'logo_bytes.dart';
import 'tracking.dart';

const _intervalli = [5, 15, 30, 60];

// Stessi hex di frontend/src/index.css. Di notte i ruoli si invertono:
// lo space-indigo del sito diventa superficie, il platinum diventa testo.
const _bg = Color(0xFF1A1C2E);
const _surface = Color(0xFF2B2D42);
const _testo = Color(0xFFF7F9FB);
const _muted = Color(0xFF8D99AE);
const _danger = Color(0xFFEF233C);
const _success = Color(0xFF2D936C);
const _raggio = 4.0;

ThemeData _temaNotte() {
  const bordo = BorderSide(color: Color(0x598D99AE));
  final forma = RoundedRectangleBorder(borderRadius: BorderRadius.circular(_raggio));
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: _bg,
    colorScheme: const ColorScheme.dark(
      primary: _testo,
      onPrimary: _surface,
      surface: _surface,
      onSurface: _testo,
      error: _danger,
      onError: _testo,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: _bg,
      foregroundColor: _testo,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: _bg,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
    ),
    cardTheme: CardThemeData(
      color: _surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_raggio), side: bordo),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: _surface,
      labelStyle: const TextStyle(color: _muted, fontWeight: FontWeight.w600),
      floatingLabelStyle: const TextStyle(color: _testo, fontWeight: FontWeight.w600),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(_raggio), borderSide: bordo),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(_raggio), borderSide: bordo),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(_raggio),
        borderSide: const BorderSide(color: _testo),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: _testo,
        foregroundColor: _surface,
        disabledBackgroundColor: const Color(0x73F7F9FB),
        disabledForegroundColor: _surface,
        minimumSize: const Size.fromHeight(48),
        shape: forma,
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: _testo,
        side: const BorderSide(color: Color(0x59F7F9FB)),
        shape: forma,
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: _testo, textStyle: const TextStyle(fontWeight: FontWeight.w600)),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: _surface),
  );
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await migraPreferenze();
  final autenticato = await preferenze().getString('token') != null;
  final tema = _temaNotte();
  runApp(MaterialApp(
    title: 'TEC Energie',
    theme: tema,
    darkTheme: tema,
    themeMode: ThemeMode.dark,
    home: autenticato ? const HomePage() : const LoginPage(),
  ));
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _attesa = false;
  String? _errore;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _accedi() async {
    setState(() {
      _attesa = true;
      _errore = null;
    });
    try {
      final username = _username.text.trim();
      final token = await login(username, _password.text);
      final prefs = preferenze();
      await prefs.setString('username', username);
      await prefs.setString('password', _password.text);
      await prefs.setString('token', token);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const HomePage()));
    } catch (e) {
      setState(() {
        _attesa = false;
        _errore = '$e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 48, 24, 32),
              children: [
                const _Marchio(grande: true),
                const SizedBox(height: 28),
                Text(
                  'Accedi',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        color: _testo,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.4,
                      ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Area riservata tecnici e amministrazione.',
                  style: TextStyle(color: _muted, fontSize: 15),
                ),
                const SizedBox(height: 28),
                TextField(
                  controller: _username,
                  decoration: const InputDecoration(labelText: 'Username'),
                  autocorrect: false,
                  enabled: !_attesa,
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _password,
                  decoration: const InputDecoration(labelText: 'Password'),
                  obscureText: true,
                  enabled: !_attesa,
                  onSubmitted: (_) => _accedi(),
                ),
                if (_errore != null) ...[
                  const SizedBox(height: 16),
                  _MessaggioErrore(_errore!),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _attesa ? null : _accedi,
                  child: Text(_attesa ? 'Accesso...' : 'Accedi'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _prefs = preferenze();
  late final AppLifecycleListener _lifecycle;
  int _minuti = 15;
  double? _lat;
  double? _lon;
  DateTime? _ultimoInvio;
  String? _errore;
  String? _problemaPermessi;
  bool _invio = false;

  @override
  void initState() {
    super.initState();
    // Al ritorno nell'app: il worker può aver inviato, o l'utente cambiato i permessi
    _lifecycle = AppLifecycleListener(onResume: _aggiorna);
    _avvia();
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _avvia() async {
    try {
      final salvato = await _prefs.getInt('intervallo') ?? 15;
      _minuti = _intervalli.contains(salvato) ? salvato : 15;
      if (_minuti != salvato) await _prefs.setInt('intervallo', _minuti);
      await _chiediPermessi();
      await avviaTracking();
    } catch (_) {
      // Permessi / service: non far chiudere l'app.
    }
    await _aggiorna();
  }

  // Notifica + posizione + batteria. Ordine: prima GPS (serve al FGS location), poi il resto.
  Future<void> _chiediPermessi() async {
    var loc = await Geolocator.checkPermission();
    if (loc == LocationPermission.denied) {
      loc = await Geolocator.requestPermission();
    }
    if (loc == LocationPermission.whileInUse) {
      await Geolocator.requestPermission();
    }
    await Permission.notification.request();
    if (await Permission.ignoreBatteryOptimizations.isDenied) {
      await Permission.ignoreBatteryOptimizations.request();
    }
  }

  Future<void> _aggiorna() async {
    final invio = await _prefs.getString('ultimo_invio');
    final lat = await _prefs.getDouble('ultima_lat');
    final lon = await _prefs.getDouble('ultima_lon');
    final errore = await _prefs.getString('ultimo_errore');
    final problema = await _controllaPermessi();
    if (!mounted) return;
    setState(() {
      _ultimoInvio = invio == null ? null : DateTime.parse(invio);
      _lat = lat;
      _lon = lon;
      _errore = errore;
      _problemaPermessi = problema;
    });
  }

  Future<String?> _controllaPermessi() async {
    if (!await Geolocator.isLocationServiceEnabled()) return 'GPS disattivato';
    if (await Geolocator.checkPermission() != LocationPermission.always) {
      return 'Per l\'invio a app chiusa: Autorizzazioni -> Posizione -> "Consenti sempre"';
    }
    if (!await Permission.notification.isGranted) {
      return 'Abilita le notifiche: la notifica fissa tiene vivo il tracciamento';
    }
    if (await Permission.ignoreBatteryOptimizations.isDenied) {
      return 'Disattiva ottimizzazione batteria per TEC Energie (altrimenti Android ferma l\'invio)';
    }
    return null;
  }

  Future<void> _apriImpostazioni() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      await Geolocator.openLocationSettings();
    } else {
      await Geolocator.openAppSettings();
    }
  }

  Future<void> _cambiaIntervallo(int? minuti) async {
    if (minuti == null) return;
    await _prefs.setInt('intervallo', minuti);
    setState(() => _minuti = minuti);
    await aggiornaIntervallo();
  }

  Future<void> _inviaOra() async {
    setState(() => _invio = true);
    await inviaOra();
    await _aggiorna();
    if (mounted) setState(() => _invio = false);
  }

  Future<void> _esci() async {
    await fermaTracking();
    await _prefs.clear();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginPage()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        titleSpacing: 8,
        leadingWidth: 72,
        leading: const Padding(
          padding: EdgeInsets.only(left: 12),
          child: _Marchio(),
        ),
        title: const Text(
          'Posizione',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: OutlinedButton(onPressed: _esci, child: const Text('Esci')),
          ),
        ],
      ),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                if (_problemaPermessi != null) ...[
                  _MessaggioErrore(_problemaPermessi!),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(onPressed: _apriImpostazioni, child: const Text('Apri impostazioni')),
                  ),
                  const SizedBox(height: 8),
                ],
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
                    child: Row(
                      children: [
                        const Expanded(child: Text('Invia ogni')),
                        DropdownButton<int>(
                          value: _minuti,
                          dropdownColor: _surface,
                          underline: const SizedBox.shrink(),
                          items: [
                            for (final m in _intervalli)
                              DropdownMenuItem(value: m, child: Text(m == 60 ? '1 ora' : '$m minuti')),
                          ],
                          onChanged: _cambiaIntervallo,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'ULTIMO INVIO',
                          style: TextStyle(color: _muted, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.6),
                        ),
                        const SizedBox(height: 8),
                        if (_ultimoInvio == null)
                          const Text('Nessuna posizione inviata', style: TextStyle(color: _muted))
                        else ...[
                          Text(
                            '${_lat!.toStringAsFixed(5)}, ${_lon!.toStringAsFixed(5)}',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: -0.3),
                          ),
                          const SizedBox(height: 4),
                          Text('alle ${_formatta(_ultimoInvio!)}', style: const TextStyle(color: _success)),
                        ],
                      ],
                    ),
                  ),
                ),
                if (_errore != null) ...[
                  const SizedBox(height: 12),
                  _MessaggioErrore('Ultimo tentativo fallito: $_errore'),
                ],
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _invio ? null : _inviaOra,
                  icon: _invio
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.my_location),
                  label: Text(_invio ? 'Invio...' : 'Invia ora'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Marchio extends StatelessWidget {
  const _Marchio({this.grande = false});

  final bool grande;

  @override
  Widget build(BuildContext context) {
    // Image.memory: su Windows Flutter falliva la copy degli asset nel folder build/.
    final altezza = grande ? 140.0 : 44.0;
    return Align(
      alignment: grande ? Alignment.center : Alignment.centerLeft,
      child: Image.memory(
        kLogoBytes,
        height: altezza,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
        gaplessPlayback: true,
        semanticLabel: 'TEC Energie',
      ),
    );
  }
}

class _MessaggioErrore extends StatelessWidget {
  const _MessaggioErrore(this.testo);

  final String testo;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      decoration: const BoxDecoration(
        color: Color(0x1FEF233C),
        border: Border(left: BorderSide(color: _danger, width: 3)),
      ),
      child: Text(testo, style: const TextStyle(color: _danger, fontSize: 14)),
    );
  }
}

String _formatta(DateTime t) {
  String due(int n) => n.toString().padLeft(2, '0');
  return '${due(t.hour)}:${due(t.minute)} del ${due(t.day)}/${due(t.month)}';
}
