package com.carrental.repository;

import com.carrental.model.Car;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CarRepository extends JpaRepository<Car, Long> {
    List<Car> findByOwnerId(Long ownerId);
    List<Car> findByCity(String city);
    List<Car> findByIsAvailable(boolean isAvailable);
}
