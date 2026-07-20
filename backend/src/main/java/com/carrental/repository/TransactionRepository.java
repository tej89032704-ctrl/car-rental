package com.carrental.repository;

import com.carrental.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface TransactionRepository extends JpaRepository<Transaction, Long> {
    List<Transaction> findByCustomerId(Long customerId);
    List<Transaction> findByOwnerId(Long ownerId);
    List<Transaction> findByTripId(Long tripId);
}
