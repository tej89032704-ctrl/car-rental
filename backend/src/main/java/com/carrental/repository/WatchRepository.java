package com.carrental.repository;

import com.carrental.model.Watch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WatchRepository extends JpaRepository<Watch, Long> {
    List<Watch> findByCustomerId(Long customerId);
    List<Watch> findByCarId(Long carId);
    Optional<Watch> findByCustomerIdAndCarId(Long customerId, Long carId);
    void deleteByCustomerIdAndCarId(Long customerId, Long carId);
}
