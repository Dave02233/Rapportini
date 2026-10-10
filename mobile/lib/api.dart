import 'dart:convert';
import 'dart:io';

const baseUrl = 'https://gestionale.davide-test.online';

class ApiError implements Exception {
  ApiError(this.status, this.message);

  final int status;
  final String message;

  @override
  String toString() => message;
}

Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body, {String? token}) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
  try {
    final req = await client.postUrl(Uri.parse('$baseUrl$path'));
    req.headers.contentType = ContentType.json;
    if (token != null) req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
    req.write(jsonEncode(body));

    final res = await req.close();
    final text = await res.transform(utf8.decoder).join();
    if (res.statusCode != 200) throw ApiError(res.statusCode, _detail(text, res.statusCode));
    return jsonDecode(text) as Map<String, dynamic>;
  } finally {
    client.close();
  }
}

String _detail(String text, int status) {
  try {
    final detail = jsonDecode(text)['detail'];
    if (detail is String) return detail;
  } catch (_) {}
  return 'Errore del server ($status)';
}

Future<String> login(String username, String password) async {
  final data = await _post('/login', {'username': username, 'password': password});
  return data['access_token'] as String;
}

Future<void> inviaPosizione(String token, double lat, double lon) async {
  await _post('/users/positions', {'lat': lat, 'lon': lon}, token: token);
}
