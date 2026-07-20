FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY backend/ ./backend/
RUN cd backend && \
    apt-get update && apt-get install -y maven && \
    mvn clean package -DskipTests -Dmaven.compiler.release=21

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/backend/target/*.jar app.jar
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
