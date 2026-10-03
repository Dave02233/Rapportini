import { login as loginApi } from "../api";


export function parseJwt (token){
    const payload = token.split(".")[1];

    // Decodifica base64 in browser
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);

    return {
        id: data.sub,
        role: data.role
    };
}

export async function loginAuth(username, password) {

    const data = await loginApi(username, password);
    localStorage.setItem("token", data.access_token);

    return data.access_token;

}

export function logoutAuth() {
    localStorage.removeItem("token");
}