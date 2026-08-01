package com.carrental;

import java.net.URI;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CarRentalApplication {
    public static void main(String[] args) {
        String dbUrl = System.getenv("DATABASE_URL");
        if (dbUrl != null) {
            if (dbUrl.startsWith("jdbc:")) {
                dbUrl = dbUrl.substring(5);
            }
            if (dbUrl.startsWith("postgresql://")) {
                dbUrl = "postgresql://" + dbUrl.substring("postgresql://".length());
                try {
                    URI uri = new URI(dbUrl);
                    String host = uri.getHost();
                    int port = uri.getPort() == -1 ? 5432 : uri.getPort();
                    String path = uri.getPath() == null ? "" : uri.getPath();
                    // Render (and most managed Postgres) require an encrypted connection.
                    // Preserve any query params already in DATABASE_URL and force sslmode=require.
                    String query = uri.getQuery();
                    if (query == null || query.isEmpty()) {
                        query = "sslmode=require";
                    } else if (!query.contains("sslmode=")) {
                        query = query + "&sslmode=require";
                    }
                    String jdbcUrl = "jdbc:postgresql://" + host + ":" + port + path + "?" + query;
                    System.setProperty("spring.datasource.url", jdbcUrl);
                    System.setProperty("spring.datasource.hikari.jdbc-url", jdbcUrl);
                } catch (Exception e) {
                    String jdbcUrl = "jdbc:" + (dbUrl.startsWith("jdbc:") ? dbUrl : dbUrl);
                    System.setProperty("spring.datasource.url", jdbcUrl);
                    System.setProperty("spring.datasource.hikari.jdbc-url", jdbcUrl);
                }
            }
        }
        SpringApplication.run(CarRentalApplication.class, args);
    }
}
