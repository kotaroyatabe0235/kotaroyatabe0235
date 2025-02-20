package something_web;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;

public class SimpleHttpServer {
  public static void main(String... args) {
    int port = 8083;

    try (ServerSocket serverSocket = new ServerSocket(port)) {
      System.out.println("Server is listening on port " + port);

      while (true) {
        try (Socket clientSocket = serverSocket.accept();
            BufferedReader in = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));
            OutputStream out = clientSocket.getOutputStream()) {

              // HTTPリクエストn最初の行を読み取る（例："GET / HTTP/1.1")
              String requestLine = in.readLine();
              if (requestLine == null || requestLine.isEmpty()) continue;
              System.out.println("Received request: " + requestLine);

              // 残りのリクエストヘッダーを読み飛ばす
              while (true) {
                  String line = in.readLine();
                  if (line == null || line.isEmpty()) break; // 空行が来たら終了
              }

              // HTTP レスポンスを送信
              String response = "HTTP/1.1 200 OK\\r\\n" +
                                "Content-Type: text/plain\\r\\n" +
                                "Content-Length: 13\\r\\n" +
                                "\\r\\n" +
                                "Hello, World!";
              out.write(response.getBytes());
              out.flush();
        } catch (IOException e) {
          System.err.println("Error handling client: " + e.getMessage());
          e.printStackTrace();
        }
      }
      
    } catch (IOException e) {
      System.err.println("[ERROR]サーバーの起動に失敗しました。");
      e.printStackTrace();
    }
  }
}